import { Radar } from 'lucide-react';

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state surface"><div className="empty-icon"><Radar size={26} /></div><strong>{title}</strong><p>{detail}</p></div>;
}
