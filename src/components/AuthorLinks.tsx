import { useId } from 'react';
import './AuthorLinks.css';

export function AuthorLinks() {
  const tooltipId = useId();

  return <nav className="author-links" aria-label="作者与项目链接">
    <a className="author-link author-link-bilibili" href="https://space.bilibili.com/661830801"
      target="_blank" rel="noopener noreferrer" title="作者 Bilibili 主页"
      aria-label="作者 Bilibili 主页（在新标签页打开）" aria-describedby={`${tooltipId}-bilibili`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="m7 2 3 3m7-3-3 3"/>
        <rect x="3" y="5" width="18" height="15" rx="3"/>
        <path d="M8 10v3m8-3v3m-6 3h4"/>
      </svg>
      <span className="author-link-tooltip" id={`${tooltipId}-bilibili`} role="tooltip">作者 Bilibili 主页</span>
    </a>
    <a className="author-link author-link-github" href="https://github.com/unknown-sama-ff/auto-html_resume"
      target="_blank" rel="noopener noreferrer" title="GitHub 项目主页"
      aria-label="GitHub 项目主页（在新标签页打开）" aria-describedby={`${tooltipId}-github`}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
      <span className="author-link-tooltip" id={`${tooltipId}-github`} role="tooltip">GitHub 项目主页</span>
    </a>
  </nav>;
}
