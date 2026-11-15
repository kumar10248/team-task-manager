const User = require('../models/User');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Subscription = require('../models/Subscription');

/**
 * GET /api/admin/metrics
 * System-wide business metrics, revenue calculation, and subscription breakdown
 */
exports.getMetrics = async (req, res) => {
  try {
    const [
      totalUsers,
      totalProjects,
      totalTasks,
      totalMeetings,
      subscriptions,
    ] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      Task.countDocuments(),
      Meeting.countDocuments(),
      Subscription.find().lean(),
    ]);

    let activeStandard = 0;
    let activePro = 0;
    let activeTotal = 0;
    let trialing = 0;
    let expired = 0;
    let lifetime = 0;

    const allHistory = [];

    subscriptions.forEach((sub) => {
      if (sub.isLifetime) {
        lifetime++;
        activeTotal++;
        if (sub.plan === 'standard') activeStandard++;
        else activePro++;
      } else if (sub.status === 'active') {
        const isNotExpired = !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date();
        if (isNotExpired) {
          activeTotal++;
          if (sub.plan === 'standard') activeStandard++;
          else if (sub.plan === 'pro') activePro++;
        } else {
          expired++;
        }
      } else if (sub.status === 'trialing') {
        const isNotExpired = !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date();
        if (isNotExpired) trialing++;
        else expired++;
      } else {
        expired++;
      }

      if (Array.isArray(sub.history)) {
        sub.history.forEach((h) => {
          allHistory.push({
            ...h,
            userId: sub.user,
          });
        });
      }
    });

    const estimatedMRR = (activeStandard * 2000) + (activePro * 3000);

    // Sort recent payment transactions by date descending
    allHistory.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    const recentPayments = allHistory.slice(0, 10);

    res.json({
      success: true,
      metrics: {
        totalUsers,
        totalProjects,
        totalTasks,
        totalMeetings,
        estimatedMRR,
        subscriptions: {
          total: subscriptions.length,
          active: activeTotal,
          activeStandard,
          activePro,
          trialing,
          expired,
          lifetime,
        },
        recentPayments,
      },
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch admin metrics' });
  }
};

/**
 * GET /api/admin/users
 * Searchable, filterable list of all users and their subscription lifecycle
 */
exports.getUsers = async (req, res) => {
  try {
    const { search = '', status = 'all', plan = 'all', page = 1, limit = 50 } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const userIds = users.map((u) => u._id);

    // Fetch subscriptions, project counts, and member counts in bulk
    const [subs, ownedProjects, memberProjects] = await Promise.all([
      Subscription.find({ user: { $in: userIds } }),
      Project.aggregate([
        { $match: { createdBy: { $in: userIds } } },
        { $group: { _id: '$createdBy', count: { $sum: 1 } } },
      ]),
      ProjectMember.aggregate([
        { $match: { user: { $in: userIds } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
    ]);

    const subMap = {};
    subs.forEach((s) => {
      subMap[s.user.toString()] = s.toJSON();
    });

    const ownedMap = {};
    ownedProjects.forEach((p) => {
      ownedMap[p._id.toString()] = p.count;
    });

    const memberMap = {};
    memberProjects.forEach((m) => {
      memberMap[m._id.toString()] = m.count;
    });

    let result = users.map((u) => {
      const uid = u._id.toString();
      const sub = subMap[uid] || {
        plan: 'free',
        status: 'trialing',
        amount: 0,
        isLifetime: false,
        daysRemaining: 14,
        isActive: true,
      };

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        isSuperAdmin: Boolean(u.isSuperAdmin),
        isClockedIn: Boolean(u.isClockedIn),
        createdAt: u.createdAt,
        subscription: sub,
        ownedProjectsCount: ownedMap[uid] || 0,
        memberProjectsCount: memberMap[uid] || 0,
      };
    });

    // Apply status filter if provided
    if (status !== 'all') {
      result = result.filter((u) => {
        if (status === 'lifetime') return u.subscription.isLifetime;
        if (status === 'active') return u.subscription.status === 'active';
        if (status === 'trialing') return u.subscription.status === 'trialing';
        if (status === 'expired') return u.subscription.status === 'expired';
        return true;
      });
    }

    // Apply plan filter if provided
    if (plan !== 'all') {
      result = result.filter((u) => u.subscription.plan === plan);
    }

    const totalCount = await User.countDocuments(query);

    res.json({
      success: true,
      users: result,
      totalCount,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('Admin getUsers error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

/**
 * PATCH /api/admin/users/:id/subscription
 * Override a user's subscription (grant lifetime, extend trial, upgrade/downgrade plan, expire)
 */
exports.updateUserSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, plan, days = 14 } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let update = {};

    switch (action) {
      case 'grant_lifetime':
        update = {
          user: user._id,
          plan: 'pro',
          status: 'active',
          amount: 3000,
          currency: 'INR',
          isLifetime: true,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          $push: {
            history: {
              paymentId: `vip_grant_${Date.now()}`,
              orderId: `admin_override_${Date.now()}`,
              amount: 0,
              plan: 'Pro (Lifetime VIP)',
              paidAt: new Date(),
              method: 'super_admin_override',
            },
          },
        };
        break;

      case 'extend_trial': {
        const sub = await Subscription.findOne({ user: user._id });
        const baseDate = sub?.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()
          ? new Date(sub.currentPeriodEnd)
          : new Date();
        const newEnd = new Date(baseDate.getTime() + Number(days) * 24 * 60 * 60 * 1000);

        update = {
          user: user._id,
          status: 'trialing',
          isLifetime: false,
          currentPeriodEnd: newEnd,
        };
        break;
      }

      case 'set_plan': {
        const targetPlan = plan || 'pro';
        const price = targetPlan === 'pro' ? 3000 : (targetPlan === 'standard' ? 2000 : 0);
        update = {
          user: user._id,
          plan: targetPlan,
          status: 'active',
          amount: price,
          currency: 'INR',
          isLifetime: false,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          cancelAtPeriodEnd: false,
          $push: {
            history: {
              paymentId: `admin_plan_set_${Date.now()}`,
              orderId: `admin_set_${Date.now()}`,
              amount: price,
              plan: targetPlan === 'pro' ? 'Pro Plan' : 'Standard Plan',
              paidAt: new Date(),
              method: 'super_admin_override',
            },
          },
        };
        break;
      }

      case 'expire':
        update = {
          user: user._id,
          status: 'expired',
          isLifetime: false,
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        };
        break;

      case 'reset_trial':
        update = {
          user: user._id,
          plan: 'free',
          status: 'trialing',
          amount: 0,
          isLifetime: false,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        };
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid action provided' });
    }

    const updated = await Subscription.findOneAndUpdate(
      { user: user._id },
      update,
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Successfully updated subscription for ${user.name}!`,
      subscription: updated,
    });
  } catch (err) {
    console.error('updateUserSubscription error:', err);
    res.status(500).json({ success: false, message: 'Failed to update user subscription' });
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Toggle Super Admin privileges for a user
 */
exports.toggleSuperAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { isSuperAdmin } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { isSuperAdmin: Boolean(isSuperAdmin) },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({
      success: true,
      message: `User ${user.name} is now ${isSuperAdmin ? 'a Super Admin' : 'a regular user'}.`,
      user: typeof user.toPublicJSON === 'function' ? user.toPublicJSON() : user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
};

/**
 * GET /api/admin/projects
 * List all projects across the platform with creator details, member counts, and task stats
 */
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('createdBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    const projectIds = projects.map((p) => p._id);

    const [memberCounts, taskStats] = await Promise.all([
      ProjectMember.aggregate([
        { $match: { project: { $in: projectIds } } },
        { $group: { _id: '$project', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: { project: '$project', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const memberMap = {};
    memberCounts.forEach((m) => {
      memberMap[m._id.toString()] = m.count;
    });

    const taskMap = {};
    taskStats.forEach(({ _id, count }) => {
      const pid = _id.project.toString();
      if (!taskMap[pid]) taskMap[pid] = { total: 0, done: 0 };
      taskMap[pid].total += count;
      if (_id.status === 'done') taskMap[pid].done += count;
    });

    const result = projects.map((p) => {
      const pid = p._id.toString();
      return {
        ...p,
        memberCount: memberMap[pid] || 1,
        taskStats: taskMap[pid] || { total: 0, done: 0 },
      };
    });

    res.json({ success: true, projects: result });
  } catch (err) {
    console.error('Admin getProjects error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
};
