'use client';
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { tasksApi, Task } from './api';
import { useToast } from '@/components/Toast';

export interface ActiveTimerData {
  taskId: string;
  projectId: string;
  taskTitle: string;
  startTime: number; // Date.now() timestamp
  projectName?: string;
}

export interface TimerContextValue {
  activeTimer: ActiveTimerData | null;
  elapsedSeconds: number;
  isTimerRunning: boolean;
  startTimer: (task: { _id: string; title: string; projectId?: string }, projectId: string, projectName?: string) => void;
  stopAndLog: (customMinutes?: number, description?: string) => Promise<boolean>;
  cancelTimer: () => void;
  formatStopwatch: (seconds: number) => string;
}

const STORAGE_KEY = 'taskforge_active_timer';

export function formatStopwatch(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimerData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const toast = useToast();

  // Restore active timer from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ActiveTimerData = JSON.parse(saved);
        if (parsed.taskId && parsed.startTime) {
          setActiveTimer(parsed);
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - parsed.startTime) / 1000)));
        }
      }
    } catch (err) {
      console.error('Failed to restore active timer from localStorage:', err);
    }
  }, []);

  // Timer tick effect based on wall clock time
  useEffect(() => {
    if (!activeTimer) return;

    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - activeTimer.startTime) / 1000)));

    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - activeTimer.startTime) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer]);

  const startTimer = useCallback((
    task: { _id: string; title: string; projectId?: string },
    projectId: string,
    projectName?: string
  ) => {
    const targetPid = task.projectId || projectId;
    const newTimer: ActiveTimerData = {
      taskId: task._id,
      projectId: targetPid,
      taskTitle: task.title,
      startTime: Date.now(),
      projectName,
    };
    setActiveTimer(newTimer);
    setElapsedSeconds(0);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
    } catch (err) {
      console.error('Failed to save timer to localStorage:', err);
    }
    toast(`Timer started for "${task.title}" ⏱️`, 'success');
  }, [toast]);

  const stopAndLog = useCallback(async (customMinutes?: number, description?: string): Promise<boolean> => {
    if (!activeTimer) return false;

    const currentElapsed = Math.max(1, Math.floor((Date.now() - activeTimer.startTime) / 1000));
    const mins = typeof customMinutes === 'number' && customMinutes > 0
      ? customMinutes
      : Math.max(1, Math.round(currentElapsed / 60));

    const note = description || `Timer session (${formatStopwatch(currentElapsed)})`;

    try {
      const res = await tasksApi.logTime(activeTimer.projectId, activeTimer.taskId, {
        minutes: mins,
        description: note,
      });

      if (res.success) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        toast(`Logged ${timeStr} to "${activeTimer.taskTitle}"! ⏱️`, 'success');

        // Dispatch custom event for real-time local state update
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('taskforge:timelogged', {
            detail: {
              taskId: activeTimer.taskId,
              projectId: activeTimer.projectId,
              minutes: mins,
              updatedTask: res.task,
            }
          }));
        }

        setActiveTimer(null);
        setElapsedSeconds(0);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        return true;
      }
      return false;
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to log timer', 'error');
      return false;
    }
  }, [activeTimer, toast]);

  const cancelTimer = useCallback(() => {
    if (!activeTimer) return;
    setActiveTimer(null);
    setElapsedSeconds(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    toast('Timer cancelled');
  }, [activeTimer, toast]);

  return (
    <TimerContext.Provider
      value={{
        activeTimer,
        elapsedSeconds,
        isTimerRunning: Boolean(activeTimer),
        startTimer,
        stopAndLog,
        cancelTimer,
        formatStopwatch,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return ctx;
}
