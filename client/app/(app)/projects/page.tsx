'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import { Plus, FolderKanban, Trash2, ArrowRight } from 'lucide-react';

/* ================= TYPES ================= */

type Role = 'admin' | 'member' | string;

interface TaskStats {
  total: number;
  done: number;
}

interface Project {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  myRole: Role;
  taskStats?: TaskStats;
}

interface ProjectCardProps {
  project: Project;
  onDelete: (project: Project) => void;
}

interface ProjectForm {
  name: string;
  description: string;
  color: string;
}

interface FormField {
  key: keyof ProjectForm;
  label: string;
  ph: string;
}

/* ================= CONSTANTS ================= */

const COLORS: string[] = [
  '#f59e0b', '#3b82f6', '#22c55e', '#ec4899',
  '#8b5cf6', '#ef4444', '#06b6d4', '#f97316',
];

const FORM_FIELDS: FormField[] = [
  { key: 'name',        label: 'Project Name', ph: 'e.g. Marketing Campaign' },
  { key: 'description', label: 'Description',  ph: 'What is this project about?' },
];

/* ================= COMPONENT ================= */

function ProjectCard({ project, onDelete }: ProjectCardProps): ReactElement {
  const total = project.taskStats?.total ?? 0;
  const done  = project.taskStats?.done  ?? 0;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.15s, border-color 0.15s', cursor: 'pointer' }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)';
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = 'var(--bg-border)';
      }}
    >
      <div style={{ height: 4, background: project.color ?? 'var(--amber)' }} />

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderKanban size={16} color={project.color ?? 'var(--amber)'} />
            <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
              {project.name}
            </span>
          </div>
          <span className={`badge badge-${project.myRole}`}>{project.myRole}</span>
        </div>

        {project.description && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            {project.description}
          </p>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
              {done}/{total} tasks
            </span>
            <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--bg-border)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: project.color ?? 'var(--amber)', borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={`/projects/${project._id}`} style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }}>
              Open <ArrowRight size={12} />
            </button>
          </Link>

          {project.myRole === 'admin' && (
            <button
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.preventDefault(); onDelete(project); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= PAGE ================= */

export default function ProjectsPage(): ReactElement {
  const { user, loading: authLoading } = useAuth() as {
    user: { _id: string; name: string; email: string } | null;
    loading: boolean;
  };
  const router = useRouter();
  const toast  = useToast();

  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState<boolean>(true);
  const [showModal, setShowModal]       = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [saving, setSaving]             = useState<boolean>(false);
  const [form, setForm]                 = useState<ProjectForm>({ name: '', description: '', color: COLORS[0] });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const load = (): void => {
    projectsApi
      .list()
      .then((d) => setProjects(d.projects.map(p => ({ ...p, myRole: p.myRole || 'member' }))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const create = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await projectsApi.create(form);
      toast('Project created');
      setShowModal(false);
      setForm({ name: '', description: '', color: COLORS[0] });
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await projectsApi.delete(deleteTarget._id);
      toast('Project deleted');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto' }}>
        <div className="animate-fade-in">

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Workspace
              </p>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 600, color: 'var(--text-primary)' }}>
                Projects
              </h1>
            </div>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={14} /> New Project
            </button>
          </div>

          {/* Body */}
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading…</p>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <FolderKanban size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <p style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-secondary)', marginBottom: 8 }}>
                No projects yet
              </p>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
                Create one to get started
              </p>
              <button className="btn-primary" onClick={() => setShowModal(true)}>
                <Plus size={14} /> New Project
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {projects.map((p) => (
                <ProjectCard key={p._id} project={p} onDelete={setDeleteTarget} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      {showModal && (
        <Modal title="Create Project" onClose={() => setShowModal(false)}>
          <form onSubmit={create}>
            {FORM_FIELDS.map(({ key, label, ph }) => (
              <div key={key} style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  {label}
                </label>
                {key === 'description' ? (
                  <textarea
                    placeholder={ph}
                    rows={3}
                    value={form[key]}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value })}
                    style={{ resize: 'none' }}
                  />
                ) : (
                  <input
                    type="text"
                    required
                    placeholder={ph}
                    value={form[key]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })}
                  />
                )}
              </div>
            ))}

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Colour
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: form.color === c ? '3px solid white' : '3px solid transparent',
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Project Modal */}
      {deleteTarget && (
        <Modal title="Delete Project" onClose={() => setDeleteTarget(null)} width={400}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.name}</strong>? This will permanently remove all tasks.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444' }} onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}