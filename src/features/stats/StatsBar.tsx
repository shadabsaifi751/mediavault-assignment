import { useQuery } from '@tanstack/react-query';
import { getStats, type StatsResponse } from '@/api/client';
import { formatBytes } from '@/lib/format';

export function StatsBar() {
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: ({ signal }) => getStats(signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="stats-bar stats-bar--loading" aria-label="Loading library statistics">
        <span className="stats-pulse" />
        <span className="muted text-xs">Computing library stats...</span>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="stats-bar" aria-label="Library statistics">
      <div className="stat-pill" title="Total assets in repository">
        <strong>{stats.total.toLocaleString()}</strong> assets
      </div>
      <div className="stat-divider" aria-hidden="true">·</div>
      <div className="stat-pill" title="Approved assets">
        <span className="stat-dot stat-dot--approved" aria-hidden="true" />
        <strong>{(stats.byStatus['approved'] || 0).toLocaleString()}</strong> approved
      </div>
      <div className="stat-divider" aria-hidden="true">·</div>
      <div className="stat-pill" title="Assets in review">
        <span className="stat-dot stat-dot--in_review" aria-hidden="true" />
        <strong>{(stats.byStatus['in_review'] || 0).toLocaleString()}</strong> in review
      </div>
      <div className="stat-divider" aria-hidden="true">·</div>
      <div className="stat-pill" title="Total storage used">
        {formatBytes(stats.totalBytes)} total
      </div>
    </div>
  );
}
