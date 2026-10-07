// The shared interface kit. Styles live in src/index.css (@layer components);
// these wrappers add behaviour — loading, labelling, focus — on top of them.
export { Button, buttonClass } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';
export { Badge, StatusBadge } from './Badge';
export type { BadgeTone } from './Badge';
export { Card, CardHeader, MetricCard } from './Card';
export { PageHeader } from './PageHeader';
export { EmptyState, ErrorState, Skeleton, SkeletonRows, Spinner } from './States';
export { Field } from './Field';
export { Dialog, ConfirmDialog } from './Dialog';
export { ThemeToggle } from './ThemeToggle';
export { friendlyError } from '../../lib/friendlyError';
