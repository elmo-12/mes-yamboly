/* =============================================================================
   @mes/ui — Design System MES Yamboly (MDS v2.3.1)
   Tokens en ./tokens/theme.css (import '@mes/ui/theme.css')
   ========================================================================== */

/* utils + iconos */
export { cn } from './utils/cn';
export { Icon, iconMap, type IconName, type IconProps } from './icons';

/* primitives */
export { Button, buttonVariants, type ButtonProps } from './primitives/button';
export { Badge, badgeVariants, type BadgeProps, type BadgeColor } from './primitives/badge';
export { Tag, tagVariants, type TagProps } from './primitives/tag';
export {
  Input,
  Textarea,
  FieldShell,
  type InputProps,
  type TextareaProps,
  type FieldShellProps,
} from './primitives/input';
export {
  Select,
  SelectInline,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectSeparator,
  type SelectProps,
  type SelectInlineProps,
  type SelectOption,
} from './primitives/select';
export { Checkbox, type CheckboxProps } from './primitives/checkbox';
export { RadioGroup, Radio, type RadioProps } from './primitives/radio-group';
export { Switch, type SwitchProps } from './primitives/switch';
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  type TooltipProps,
} from './primitives/tooltip';
export { Avatar, initials, type AvatarProps } from './primitives/avatar';
export {
  Skeleton,
  Divider,
  Overline,
  Spinner,
  ProgressBar,
  SectionTitle,
  type SpinnerProps,
  type ProgressBarProps,
  type SectionTitleProps,
} from './primitives/feedback';

/* patterns */
export {
  Sidebar,
  SidebarFooterAction,
  Topbar,
  Breadcrumb,
  PageHeader,
  PageContent,
  type SidebarProps,
  type SidebarFooterActionProps,
  type SidebarItem,
  type SidebarGroup,
  type TopbarProps,
  type BreadcrumbProps,
  type PageHeaderProps,
  type Crumb,
} from './patterns/navigation';
export { Tabs, TabsList, TabsTrigger, TabsContent, type TabProps } from './patterns/tabs';
export {
  KpiCard,
  AlertCard,
  InsightCard,
  SummaryCard,
  type KpiCardProps,
  type AlertCardProps,
  type AlertVariant,
  type InsightCardProps,
  type SummaryCardProps,
} from './patterns/cards';
export {
  LineCard,
  type LineCardProps,
  type LineState,
  type LineMessageTone,
  type LineMetric,
  type LineProgress,
  type LineSegment,
  type SegmentTone,
} from './patterns/line-card';
export { Stepper, type StepperProps, type Step, type StepStatus } from './patterns/stepper';
export { EmptyState, type EmptyStateProps, type EmptyStateVariant } from './patterns/empty-state';
export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalContent,
  TimerChip,
  type ModalContentProps,
} from './patterns/modal';
export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, type DrawerContentProps } from './patterns/drawer';
export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './patterns/overlays';
export { Toaster, toast } from './patterns/toaster';
export {
  Table,
  THead,
  TBody,
  TH,
  TRow,
  TCell,
  TSelectHead,
  TSelectCell,
  Pagination,
  type TableProps,
  type THeadProps,
  type TRowProps,
  type TCellProps,
  type THeadCellProps,
  type PaginationProps,
} from './patterns/table';
export {
  FilterBar,
  type FilterBarProps,
  type FilterGroup,
  type FilterOption,
} from './patterns/filter-bar';
export {
  StickyFooter,
  ListDetailLayout,
  DescriptionList,
  HeatmapCell,
  heatmapStep,
  Timeline,
  type StickyFooterProps,
  type ListDetailLayoutProps,
  type DescriptionListProps,
  type DescriptionItem,
  type HeatmapCellProps,
  type TimelineProps,
  type TimelineEvent,
} from './patterns/layout';
