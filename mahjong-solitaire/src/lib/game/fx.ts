/**
 * Частицы и эффекты: искры взрывов, ударная волна, вспышка,
 * конфетти и тосты. Создаются напрямую в DOM и анимируются
 * Web Animations API.
 */

const SPARK_COLORS = ['#ffd873', '#fff6df', '#7fe3c0', '#ffb35c', '#f2a0b1', '#a8d8ff'];

export function sparkle(x: number, y: number, n = 14) {
  if (typeof document === 'undefined') return;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'mj-spark';
    const size = 4.5 + Math.random() * 10;
    const color = SPARK_COLORS[i % SPARK_COLORS.length];
    const round = Math.random() > 0.4 ? '50%' : '2px';
    d.style.cssText = [
      `left:${x - size / 2}px`,
      `top:${y - size / 2}px`,
      `width:${size}px`,
      `height:${size}px`,
      `background:${color}`,
      `box-shadow:0 0 ${size * 2.4}px ${color}`,
      `border-radius:${round}`,
    ].join(';');
    document.body.appendChild(d);
    const ang = Math.random() * Math.PI * 2;
    const dist = 36 + Math.random() * 96;
    const anim = d.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${Math.cos(ang) * dist}px, ${
            Math.sin(ang) * dist - 34
          }px) scale(.15) rotate(${Math.random() > 0.5 ? 160 : -160}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 640 + Math.random() * 460,
        easing: 'cubic-bezier(.2,.7,.3,1)',
      },
    );
    anim.onfinish = () => d.remove();
  }
}

/** ударная волна — расширяющееся кольцо взрыва пары.
 *  Иначе важно: анимируем и margin, чтобы кольцо росло строго
 *  из центра ( раньше оно «уезжало» вниз-вправо от угла ). */
export function ring(x: number, y: number) {
  if (typeof document === 'undefined') return;
  const d = document.createElement('div');
  d.className = 'mj-ring';
  d.style.cssText = `left:${x}px;top:${y}px;`;
  document.body.appendChild(d);
  const anim = d.animate(
    [
      {
        width: '14px',
        height: '14px',
        marginLeft: '-7px',
        marginTop: '-7px',
        opacity: 0.9,
        borderWidth: '6px',
      },
      {
        width: '210px',
        height: '210px',
        marginLeft: '-105px',
        marginTop: '-105px',
        opacity: 0,
        borderWidth: '1px',
      },
    ],
    { duration: 620, easing: 'cubic-bezier(.16,.62,.28,1)' },
  );
  anim.onfinish = () => d.remove();
}

/** белая вспышка в точке взрыва */
export function flash(x: number, y: number) {
  if (typeof document === 'undefined') return;
  const d = document.createElement('div');
  d.className = 'mj-flash';
  d.style.cssText = `left:${x}px;top:${y}px;`;
  document.body.appendChild(d);
  const anim = d.animate(
    [
      { transform: 'scale(.25)', opacity: 0.9 },
      { transform: 'scale(1.85)', opacity: 0 },
    ],
    { duration: 460, easing: 'cubic-bezier(.18,.6,.3,1)' },
  );
  anim.onfinish = () => d.remove();
}

/** мягкое золотое гало, догорающее после взрыва */
export function glow(x: number, y: number) {
  if (typeof document === 'undefined') return;
  const d = document.createElement('div');
  d.className = 'mj-glow';
  d.style.cssText = `left:${x}px;top:${y}px;`;
  document.body.appendChild(d);
  const anim = d.animate(
    [
      { transform: 'scale(.4)', opacity: 0.85 },
      { transform: 'scale(1.35)', opacity: 0 },
    ],
    { duration: 680, easing: 'cubic-bezier(.15,.6,.3,1)' },
  );
  anim.onfinish = () => d.remove();
}

/** компактный тост сверху по центру */
export function showToast(text: string) {
  if (typeof document === 'undefined') return;
  const old = document.querySelector('.mj-toast');
  old?.remove();
  const d = document.createElement('div');
  d.className = 'mj-toast';
  d.textContent = text;
  document.body.appendChild(d);
  const anim = d.animate(
    [
      { transform: 'translate(-50%, -14px)', opacity: 0 },
      { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.14 },
      { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.82 },
      { transform: 'translate(-50%, -10px)', opacity: 0 },
    ],
    { duration: 2100, easing: 'ease-out' },
  );
  anim.onfinish = () => d.remove();
}

/** всплывающие очки «+125» над лотком при собранной паре */
export function floatScore(text: string, tone: 'normal' | 'gold' = 'normal') {
  if (typeof window === 'undefined') return;
  const d = document.createElement('div');
  d.className = tone === 'gold' ? 'mj-float mj-float-gold' : 'mj-float';
  d.textContent = text;
  const x = window.innerWidth / 2 + (Math.random() * 80 - 40);
  d.style.cssText = `left:${x}px;top:170px;`;
  document.body.appendChild(d);
  const anim = d.animate(
    [
      { transform: 'translate(-50%, 12px) scale(.8)', opacity: 0 },
      { transform: 'translate(-50%, -6px) scale(1.18)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%, -22px) scale(1)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%, -64px) scale(.9)', opacity: 0 },
    ],
    { duration: 1150, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  anim.onfinish = () => d.remove();
}

/** залп искр по ширине экрана (победа) */
export function confetti() {
  if (typeof window === 'undefined') return;
  const w = window.innerWidth;
  for (let i = 0; i < 9; i++) {
    const delay = i * 130;
    window.setTimeout(
      () => sparkle(w * (0.1 + 0.8 * Math.random()), window.innerHeight * 0.32, 12),
      delay,
    );
  }
}
