import { useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, Download, FileUp, RefreshCcw, X } from 'lucide-react';
import { assertBackupFileSize, BackupTooLargeError, prepareBackupImport } from '../lib/backup';
import type { WorkspaceState } from '../types';

type Props = {
  versionCount: number;
  onClose: () => void;
  onDownload: (includeHistory?: boolean) => void;
  onRestore: (workspace: WorkspaceState) => Promise<void>;
};
export function BackupDialog({ versionCount, onClose, onDownload, onRestore }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const readingFile = useRef(false);
  const [mode, setMode] = useState<'download'|'restore'>(versionCount ? 'download' : 'restore');
  const [candidate, setCandidate] = useState<{ workspace: WorkspaceState; fileName: string }|null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [downloaded, setDownloaded] = useState<'full'|'contents'|null>(null);
  const [downloadTooLarge, setDownloadTooLarge] = useState(false);
  const busy = reading || restoring;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function readBackup(file: File) {
    if (readingFile.current) return;
    readingFile.current = true; setReading(true); setError(''); setCandidate(null);
    try {
      assertBackupFileSize(file.size);
      const workspace = prepareBackupImport(await file.text());
      setCandidate({ workspace, fileName: file.name });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败，请重新选择简历备份文件。'); }
    finally { readingFile.current = false; setReading(false); }
  }
  async function restore() {
    if (!candidate || busy) return;
    setRestoring(true); setError('');
    try { await onRestore(candidate.workspace); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '恢复失败，请重试。'); }
    finally { setRestoring(false); }
  }
  function download(includeHistory=true) {
    try { onDownload(includeHistory);setDownloaded(includeHistory?'full':'contents');setDownloadTooLarge(false);setError(''); }
    catch(cause){setDownloaded(null);setDownloadTooLarge(cause instanceof BackupTooLargeError&&cause.includeHistory);setError(cause instanceof Error?cause.message:'下载失败，请重试。');}
  }
  return <dialog ref={dialog} className="model-modal backup-modal" aria-labelledby="backup-dialog-title" onCancel={event => { event.preventDefault(); if (!restoring) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || restoring) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="modal-head"><div><span className="panel-kicker"><Archive size={14}/>保存与继续编辑</span><h2 id="backup-dialog-title">简历备份与恢复</h2><p>换浏览器、换电脑或清理浏览器前，保存一份备份，下次回来可以继续编辑。</p></div><button className="quiet-icon" aria-label="关闭备份与恢复" disabled={restoring} onClick={onClose}><X size={17}/></button></div>
    <div className="backup-modes"><button className={mode==='download'?'active':''} aria-pressed={mode==='download'} disabled={busy} onClick={()=>{setMode('download');setError('');}}><Download size={15}/>下载备份</button><button className={mode==='restore'?'active':''} aria-pressed={mode==='restore'} disabled={busy} onClick={()=>{setMode('restore');setError('');}}><FileUp size={15}/>从备份恢复</button></div>
    <div className="backup-content">
      <p className="backup-purpose">备份用于回到本站继续编辑；投递给招聘方，请在工作台导出 PDF 或 HTML。</p>
      {mode==='download'?<>
        <div className="backup-summary"><Archive size={25}/><div><strong>备份全部 {versionCount} 份简历</strong><p>包含简历正文、头像、模板、已保存的个人资料、岗位分析、编辑对话和修改历史。</p></div></div>
        <ol className="backup-instructions"><li>点击下方按钮，将备份文件保存到电脑或网盘。</li><li>下次打开本站，点击“备份与恢复” → “从备份恢复”。</li><li>选择保存的文件，确认后即可继续编辑。</li></ol>
        <p className="backup-file-note">无需打开或修改这个文件，直接在本站选择它即可恢复。文件后缀为 .json。</p>
        <button className="primary-button backup-download" disabled={!versionCount} onClick={()=>download()}><Download size={15}/>下载全部版本备份</button>
        {downloadTooLarge&&<div className="backup-size-option"><p>可以改为下载“简历内容备份”：保留所有当前简历、头像、模板和已保存资料，不包含修改历史、撤销记录与编辑对话。</p><button className="outline-button" onClick={()=>download(false)}><Download size={15}/>下载简历内容备份（不含历史和对话）</button></div>}
        {downloaded&&<p className="backup-success" role="status"><CheckCircle2 size={16}/>{downloaded==='contents'?'已发起简历内容备份下载，不含历史与对话。':'已发起下载。'}请保留备份文件，需要时在“从备份恢复”中选择它。</p>}
      </>:<>
        <p>选择之前在本站下载的简历备份。恢复后会加入“我的简历”，当前简历会继续保留。</p>
        <input ref={fileInput} className="backup-file-input" tabIndex={-1} aria-label="选择简历备份文件" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void readBackup(file);event.target.value='';}}/>
        <button className="outline-button backup-file-button" disabled={busy} onClick={()=>fileInput.current?.click()}>{reading?<RefreshCcw size={15} className="spin"/>:<FileUp size={17}/>} {reading?'正在读取备份…':candidate?'重新选择备份文件':'选择简历备份文件'}</button>
        {candidate&&<div className="backup-preview"><span>已读取：{candidate.fileName}</span><h3>可恢复 {candidate.workspace.versions.length} 份简历</h3><ul>{candidate.workspace.versions.map(version=><li key={version.id}><strong>{version.title}</strong><small>{version.history.length} 条修改记录 · {version.messages.length} 条编辑对话</small></li>)}</ul><p>相同版本会作为“恢复副本”加入，不覆盖当前内容。</p><button className="primary-button" disabled={busy||versionCount+candidate.workspace.versions.length>50} onClick={()=>void restore()}>{restoring?<RefreshCcw size={15} className="spin"/>:<CheckCircle2 size={15}/>} {restoring?'正在恢复…':'恢复这些简历'}</button>{versionCount+candidate.workspace.versions.length>50&&<p role="alert">恢复后会超过 50 份简历，请先备份并整理当前版本，再重试。</p>}</div>}
      </>}
      {error&&<div className="backup-error" role="alert">{error}</div>}
      <p className="backup-local-note">备份在本浏览器读取与恢复，不发送给 AI。文件含个人资料，请妥善保存。</p>
    </div>
  </dialog>;
}
