// Lightweight high-performance particle confetti burst
export function triggerConfetti() {
  if (typeof window === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    document.body.removeChild(canvas);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#6366f1', '#818cf8', '#4ade80', '#fbbf24', '#f43f5e', '#a855f7', '#38bdf8'];
  const particleCount = 70;
  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    rotation: number;
    rotationSpeed: number;
    alpha: number;
  }> = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 200,
      y: window.innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 12 - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      alpha: 1,
    });
  }

  let animationFrameId: number;
  const startTime = Date.now();

  const render = () => {
    const elapsed = Date.now() - startTime;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let hasLivingParticles = false;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.98; // air resistance
      p.rotation += p.rotationSpeed;
      if (elapsed > 1200) {
        p.alpha -= 0.03;
      }

      if (p.alpha > 0 && p.y < window.innerHeight + 50) {
        hasLivingParticles = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    if (hasLivingParticles && elapsed < 3500) {
      animationFrameId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationFrameId);
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
    }
  };

  animationFrameId = requestAnimationFrame(render);
}
