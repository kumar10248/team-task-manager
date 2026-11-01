import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in" style={{ padding: '40px 48px', flex: 1 }}>
      {/* Header Skeleton */}
      <div style={{ marginBottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="skeleton" style={{ width: 80, height: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 260, height: 38 }} />
        </div>
        <div className="skeleton" style={{ width: 130, height: 42, borderRadius: 8 }} />
      </div>

      {/* 4 Stat Cards Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 40 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 80, height: 14 }} />
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
            </div>
            <div className="skeleton" style={{ width: 60, height: 40 }} />
            <div className="skeleton" style={{ width: 100, height: 14 }} />
          </div>
        ))}
      </div>

      {/* Projects + Team split */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        <div className="glass-panel" style={{ padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div className="skeleton" style={{ width: 120, height: 24 }} />
            <div className="skeleton" style={{ width: 70, height: 16 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 32 }}>
          <div className="skeleton" style={{ width: 120, height: 24, marginBottom: 24 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="animate-fade-in" style={{ padding: '40px 48px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div className="skeleton" style={{ width: 80, height: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 200, height: 38 }} />
        </div>
        <div className="skeleton" style={{ width: 140, height: 42, borderRadius: 8 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="skeleton" style={{ width: 140, height: 22 }} />
              <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ width: '90%', height: 16 }} />
            <div className="skeleton" style={{ width: '60%', height: 16 }} />
            <div className="skeleton" style={{ width: '100%', height: 6, borderRadius: 3, marginTop: 8 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div className="skeleton" style={{ width: 70, height: 32, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="animate-fade-in" style={{ padding: '40px 48px', flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="skeleton" style={{ width: 100, height: 16, marginBottom: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="skeleton" style={{ width: 280, height: 38 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      {/* Kanban Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {['To Do', 'In Progress', 'Done'].map((col, idx) => (
          <div key={col} className="glass-panel" style={{ padding: 20, minHeight: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="skeleton" style={{ width: 90, height: 18 }} />
              <div className="skeleton" style={{ width: 24, height: 18, borderRadius: 6 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Array.from({ length: idx === 0 ? 3 : 2 }).map((_, cardIdx) => (
                <div key={cardIdx} className="skeleton" style={{ height: 120, borderRadius: 12 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TasksTableSkeleton() {
  return (
    <div className="animate-fade-in" style={{ padding: '40px 48px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div className="skeleton" style={{ width: 80, height: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 200, height: 38 }} />
        </div>
        <div className="skeleton" style={{ width: 220, height: 44, borderRadius: 12 }} />
      </div>

      <div className="glass-panel" style={{ padding: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
