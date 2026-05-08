import type { DocStatus } from "../_types/dashboard";

const STATUS_META: Record<DocStatus, { cls: string; label: string }> = {
  ready: { cls: "badge-ready", label: "Ready" },
  processing: { cls: "badge-process", label: "Processing" },
  uploading: { cls: "badge-upload", label: "Uploading" },
  error: { cls: "badge-error", label: "Error" },
};

export function StatusBadge({ status }: { status: DocStatus }) {
  const { cls, label } = STATUS_META[status];

  return <span className={`badge ${cls}`}>{label}</span>;
}
