'use client';
import { useEffect, useState, ReactElement, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi } from '@/lib/api';
import type { CreateProjectPayload } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import { Plus, FolderKanban, Trash2, ArrowRight } from 'lucide-react';

interface TaskStats { total: number; done: number }
interface Project { _id: string; name: string; description?: string; color?: string; myRole: 'admin' | 'member'; taskStats?: TaskStats }
interface ProjectForm { name: string; description: string; color: string }
interface FormField { key: keyof Pick<ProjectForm, 'name' | 'description'>; label: string; ph: string }

const COLORS: string[] = ['#f59e0b','#3b82f6','#22c55e','#ec4899','#8b5cf6','#ef4444','#06b6d4','#f97316'];
const FORM_FIELDS: FormField[] = [
  { key: 'name',        label: 'Project Name', ph: 'e.g. Marketing Campaign' },
  { key: 'description', label: 'Description',  ph: 'What is this project about?' },
];

function ProjectCard({ project, onDelete }: { project: Project; onDelete: (p: Project) => void }): ReactElement {
  const total = project.taskStats?.total ?? 0;
  const done  = project.taskStats?.done  ?? 0;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  const baseColor = project.color ?? 'var(--accent-primary)';

  return (
    <div className="glass-panel" style={{ padding:0, overflow:'hidden', transition:'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', cursor:'pointer', position: 'relative' }}
      onMouseEnter={(e) => { 
        e.currentTarget.style.transform='translateY(-4px)'; 
        e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; 
        e.currentTarget.style.boxShadow=`0 8px 30px -10px ${baseColor}40`;
      }}
      onMouseLeave={(e) => { 
        e.currentTarget.style.transform=''; 
        e.currentTarget.style.borderColor='rgba(255,255,255,0.05)';
        e.currentTarget.style.boxShadow='0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
      }}>
      
      {/* Top accent line */}
      <div style={{ height: 4, background: baseColor, boxShadow: `0 0 10px ${baseColor}` }} />
      
      {/* Ambient background glow inside the card */}
      <div style={{ position:'absolute', top: -50, right: -50, width: 120, height: 120, background: baseColor, filter: 'blur(50px)', opacity: 0.1, borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ padding: 24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 16 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderKanban size={16} color={baseColor} />
            </div>
            <span style={{ fontFamily:'Fraunces, serif', fontSize: 18, color:'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.01em' }}>{project.name}</span>
          </div>
          <span className={`badge badge-${project.myRole}`}>{project.myRole}</span>
        </div>
        
        {project.description && (
          <p style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color:'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>{project.description}</p>
        )}
        
        <div style={{ marginBottom: 20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontFamily:'Outfit, sans-serif', color:'var(--text-muted)' }}>{done}/{total} tasks</span>
            <span style={{ fontSize: 12, fontFamily:'Outfit, sans-serif', color:'var(--text-primary)', fontWeight: 500 }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background:'var(--bg-border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background: baseColor, borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }} />
          </div>
        </div>
        
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Link href={`/projects/${project._id}`} style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ fontSize: 12, padding:'8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>Open <ArrowRight size={14} /></button>
          </Link>
          {project.myRole === 'admin' && (
            <button onClick={(e) => { e.preventDefault(); onDelete(project); }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex', padding: 6, borderRadius: 6, transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage(): ReactElement {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast  = useToast();

  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [saving, setSaving]             = useState(false);
  const [form, setForm]                 = useState<ProjectForm>({ name:'', description:'', color: COLORS[0] });

  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);

  const load = async () => {
    try {
      const { projects: raw } = await projectsApi.list();

      // Fetch task counts for every project in parallel
      const withStats = await Promise.all(
        raw.map(async (p) => {
          try {
            const { tasks } = await tasksApi.list(p._id);
            const total = tasks.length;
            const done  = tasks.filter((t) => t.status === 'done').length;
            return {
              ...p,
              myRole: (p.myRole ?? 'member') as 'admin' | 'member',
              taskStats: { total, done },
            };
          } catch {
            return { ...p, myRole: (p.myRole ?? 'member') as 'admin' | 'member', taskStats: { total: 0, done: 0 } };
          }
        })
      );

      setProjects(withStats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await projectsApi.create(form as CreateProjectPayload);
      toast('Project created');
      setShowModal(false);
      setForm({ name:'', description:'', color: COLORS[0] });
      load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await projectsApi.delete(deleteTarget._id);
      toast('Project deleted');
      setDeleteTarget(null);
      load();
    } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex:1, padding:'40px 48px', overflow:'auto', position: 'relative', zIndex: 1 }}>
        
        {/* Subtle background glow */}
        <div style={{ position:'absolute', top:'-10%', left:'50%', transform:'translateX(-50%)', width:'60vw', height:'40vw', background:'radial-gradient(circle, rgba(129, 140, 248, 0.05) 0%, transparent 60%)', filter:'blur(80px)', zIndex:-1, pointerEvents:'none' }} />

        <div className="animate-fade-in">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 40 }}>
            <div>
              <p style={{ fontFamily:'Outfit, sans-serif', fontSize: 13, fontWeight:500, color:'var(--accent-primary)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom: 8 }}>Workspace</p>
              <h1 style={{ fontFamily:'Fraunces, serif', fontSize: 36, fontWeight:400, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>Projects</h1>
            </div>
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={16} /> New Project
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--bg-border)', borderTopColor: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : projects.length === 0 ? (
            <div className="glass-panel" style={{ textAlign:'center', padding:'80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <FolderKanban size={32} color="var(--text-muted)" />
              </div>
              <p style={{ fontFamily:'Fraunces, serif', fontSize: 24, color:'var(--text-primary)', marginBottom: 12 }}>No projects yet</p>
              <p style={{ fontFamily:'Outfit, sans-serif', fontSize: 14, color:'var(--text-secondary)', marginBottom: 24 }}>Create your first project to get started.</p>
              <button className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={16}/> New Project
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
              {projects.map((p) => <ProjectCard key={p._id} project={p} onDelete={setDeleteTarget} />)}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <Modal title="Create Project" onClose={() => setShowModal(false)}>
          <form onSubmit={create}>
            {FORM_FIELDS.map(({ key, label, ph }) => (
              <div key={key} style={{ marginBottom: 20 }}>
                <label style={{ display:'block', fontSize: 12, fontFamily:'Outfit, sans-serif', fontWeight: 500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom: 8 }}>{label}</label>
                {key === 'description'
                  ? <textarea placeholder={ph} rows={3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ resize:'none' }} />
                  : <input type="text" required placeholder={ph} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
              </div>
            ))}
            <div style={{ marginBottom: 32 }}>
              <label style={{ display:'block', fontSize: 12, fontFamily:'Outfit, sans-serif', fontWeight: 500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom: 12 }}>Colour</label>
              <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: c, border: form.color === c ? '3px solid white' : '3px solid transparent', cursor: 'pointer', padding: 0, transition: 'all 0.2s', boxShadow: form.color === c ? `0 0 15px ${c}80` : 'none' }} 
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  />
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap: 12, justifyContent:'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowModal(false)} style={{ padding: '10px 20px' }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '10px 24px' }}>{saving ? 'Creating…' : 'Create Project'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete Project" onClose={() => setDeleteTarget(null)} width={420}>
          <p style={{ color:'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', marginBottom: 28, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color:'var(--text-primary)' }}>{deleteTarget.name}</strong>? This action will permanently remove the project and all of its tasks.
          </p>
          <div style={{ display:'flex', gap: 12, justifyContent:'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteTarget(null)} style={{ padding: '10px 20px' }}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444', padding: '10px 24px' }} onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}