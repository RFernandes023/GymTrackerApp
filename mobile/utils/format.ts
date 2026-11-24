const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const numFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
export const fmtDate = (ts: number) => dateFmt.format(ts);
export const fmtDateTime = (ts: number) => dateTimeFmt.format(ts);
export const fmtNumber = (n: number) => numFmt.format(n);
export const fmtKg = (n: number) => `${numFmt.format(n)} kg`;
export const fmtMinutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`;
