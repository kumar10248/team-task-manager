'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, authApi, Project } from '@/lib/api';
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Settings,
  Clock,
  Plus,
  CornerDownLeft
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ size: number; color?: string }>;
  action: () => void;
  category: 'Navigation' | 'Projects' | 'Actions';
}

export default function CommandPalette() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load project list when palette opens
  useEffect(() => {
    if (isOpen && user) {
      projectsApi
        .list()
        .then((res) => setProjects(res.projects || []))
        .catch(console.error);
    }
  }, [isOpen, user]);

  // Global shortcut listener (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const toggleClock = useCallback(async () => {
    close();
    try {
      const res = user?.isClockedIn ? await authApi.clockOut() : await authApi.clockIn();
      if (res.success && setUser) {
        setUser(res.user);
      }
    } catch (err) {
      console.error(err);
    }
  }, [close, user, setUser]);

  // Build items list
  const defaultItems: CommandItem[] = [
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      subtitle: 'Overview & metrics',
      icon: LayoutDashboard,
      category: 'Navigation',
      action: () => navigateTo('/dashboard'),
    },
    {
      id: 'nav-projects',
      title: 'Projects',
      subtitle: 'View all projects and boards',
      icon: FolderKanban,
      category: 'Navigation',
      action: () => navigateTo('/projects'),
    },
    {
      id: 'nav-tasks',
      title: 'My Tasks',
      subtitle: 'Assigned to me',
      icon: CheckSquare,
      category: 'Navigation',
      action: () => navigateTo('/tasks'),
    },
    {
      id: 'nav-settings',
      title: 'Settings',
      subtitle: 'Profile and preferences',
      icon: Settings,
      category: 'Navigation',
      action: () => navigateTo('/settings'),
    },
    {
      id: 'action-clock',
      title: user?.isClockedIn ? 'Clock Out' : 'Clock In',
      subtitle: user?.isClockedIn ? 'End your shift' : 'Begin your shift',
      icon: Clock,
      category: 'Actions',
      action: toggleClock,
    },
    {
      id: 'action-new-project',
      title: 'Create New Project',
      subtitle: 'Set up a new team workspace',
      icon: Plus,
      category: 'Actions',
      action: () => navigateTo('/projects'),
    },
  ];

  const projectItems: CommandItem[] = projects.map((p) => ({
    id: `project-${p._id}`,
    title: p.name,
    subtitle: `${p.taskStats?.done ?? 0}/${p.taskStats?.total ?? 0} tasks completed`,
    icon: FolderKanban,
    category: 'Projects',
    action: () => navigateTo(`/projects/${p._id}`),
  }));

  const allItems = [...defaultItems, ...projectItems];

  const filteredItems = allItems.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Handle arrow keys and enter
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 5, 10, 0.75)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={close}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 580,
          background: '#0d0f17',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(129, 140, 248, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <Search size={18} color="var(--accent-primary)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or jump to project… (Esc to exit)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 15,
              fontFamily: 'Outfit, sans-serif',
              padding: 0,
            }}
          />
          <kbd
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '3px 6px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '10px 8px' }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>No matching commands or projects found.</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(129, 140, 248, 0.12)' : 'transparent',
                    border: isSelected ? '1px solid rgba(129, 140, 248, 0.25)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSelected ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontFamily: 'Outfit, sans-serif',
                          fontWeight: 500,
                          color: isSelected ? '#fff' : 'var(--text-primary)',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(255, 255, 255, 0.03)',
                      }}
                    >
                      {item.category}
                    </span>
                    {isSelected && <CornerDownLeft size={13} color="var(--accent-primary)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>esc Dismiss</span>
          </div>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>TaskForge ⌘K</span>
        </div>
      </div>
    </div>
  );
}
