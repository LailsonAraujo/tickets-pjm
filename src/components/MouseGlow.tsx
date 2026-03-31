import { useEffect, useRef } from 'react';

export function MouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (glowRef.current) {
        glowRef.current.style.left = `${e.clientX}px`;
        glowRef.current.style.top = `${e.clientY}px`;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      ref={glowRef}
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, hsl(120 100% 40% / 0.06) 0%, transparent 70%)',
        borderRadius: '50%',
        transition: 'left 0.1s ease-out, top 0.1s ease-out',
      }}
    />
  );
}
