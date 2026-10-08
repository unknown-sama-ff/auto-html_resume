import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { HeartHandshake } from 'lucide-react';

export function SponsorButton() {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);
  const pointerFocus = useRef(false);
  const keyboardFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 60, width: 280, maxHeight: 560 });

  function positionPopup() {
    const anchor = button.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min(anchor.bottom, window.innerHeight - 180));
    setPosition({ left, top, width, maxHeight: Math.max(150, window.innerHeight - top - 12) });
  }

  function show() {
    positionPopup();
    setOpen(true);
  }

  function close() {
    pinned.current = false;
    keyboardFocus.current = false;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const resize = () => positionPopup();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    // Scrolling the page dismisses the anchored QR instead of leaving it detached.
    window.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', close);
    };
  }, [open]);

  return <div className="sponsor-control" ref={root}
    onPointerEnter={event => { if (event.pointerType === 'mouse') show(); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && !keyboardFocus.current) close(); }}>
    <button ref={button} type="button" className={`outline-button sponsor-button ${open ? 'is-open' : ''}`}
      aria-label="赞助" aria-controls="sponsor-alipay-qr" aria-expanded={open}
      aria-describedby={open ? 'sponsor-alipay-qr' : undefined}
      onPointerDown={() => { pointerFocus.current = true; keyboardFocus.current = false; }}
      onFocus={() => { if (!pointerFocus.current) { keyboardFocus.current = true; show(); } }}
      onBlur={event => {
        pointerFocus.current = false;
        if (!(event.relatedTarget instanceof Node) || !root.current?.contains(event.relatedTarget)) close();
      }}
      onClick={() => {
        pointerFocus.current = false;
        if (pinned.current) close();
        else { pinned.current = true; show(); }
      }}><HeartHandshake size={15}/><span>赞助</span><span aria-hidden="true">→</span></button>
    {open && <div id="sponsor-alipay-qr" role="tooltip" aria-label="支付宝赞助二维码"
      className="sponsor-tooltip-shell" style={{ left: position.left, top: position.top, width: position.width, '--sponsor-max-height': `${position.maxHeight}px` } as CSSProperties}>
      <div className="sponsor-card">
        {imageFailed ? <div className="sponsor-image-error">二维码未能加载，请刷新页面重试。</div> : <img
          className="sponsor-qr-image" src="/alipay-sponsor-qr.jpg" alt="支付宝个人收款二维码"
          width="1080" height="1620" onError={() => setImageFailed(true)}/>}
        <p>使用支付宝扫描二维码支持作者</p>
      </div>
    </div>}
  </div>;
}
