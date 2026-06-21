// Primitives
export { cn } from "./cn.js";
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "./button.js";
export { Input } from "./input.js";
export { Label } from "./label.js";
export { Textarea } from "./textarea.js";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  type CardProps,
} from "./card.js";
export {
  Badge,
  type BadgeProps,
  type BadgeTone,
  type BadgeVariant,
} from "./badge.js";
export { Alert, type AlertProps } from "./alert.js";
export { Skeleton } from "./skeleton.js";
export { Spinner } from "./spinner.js";
export { Field } from "./field.js";
export { Logo, LogoMark } from "./logo.js";
export { Avatar, type AvatarProps } from "./avatar.js";
export { AuthSplitPanel } from "./auth-split-panel.js";
export { Progress, type ProgressProps } from "./progress.js";

// Radix-backed interactive components
export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./select.js";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs.js";
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./table.js";
export { RadioGroup, RadioGroupItem } from "./radio-group.js";
export { Checkbox } from "./checkbox.js";
export { ConfirmDialog } from "./confirm-dialog.js";
export { VerifyCard, type VerifyCardProps, type VerifyStatus } from "./verify-card.js";
export {
  ChatWindow,
  type ChatCitation,
  type ChatWindowProps,
} from "./chat-window.js";
export { Toaster, toast } from "./toast.js";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./dropdown-menu.js";

// Error boundary
export { ErrorBoundary } from "./error-boundary.js";

// Theme
export {
  ThemeProvider,
  ThemeToggle,
  themeScript,
  type Theme,
} from "./theme.js";

// Layout + status
export {
  AppShell,
  PageHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from "./layout.js";
export {
  SidebarShell,
  sidebarNavItemClass,
  sidebarMobileLinkClass,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavAccent,
} from "./app-shell.js";
export {
  applicationStatus,
  applicationPillStatus,
  jobStatus,
  statusToneClasses,
  type StatusToken,
} from "./status.js";
export { StatusPill, type StatusPillProps } from "./status-pill.js";

// De-duplicated app components (lifted from candidate + company)
export { AuthLayout } from "./auth-layout.js";
export {
  NotificationItem,
  type NotificationItemProps,
  type NotificationItemData,
} from "./notification-item.js";
export { SsoButtons, type SsoButtonsProps, type OAuthProvidersApi } from "./sso-buttons.js";
export { AssistantChat, type AssistantChatProps } from "./assistant-chat.js";
export {
  MessageThreadView,
  type MessageThreadViewProps,
  type ThreadMessage,
  type ThreadOptimisticMessage,
} from "./message-thread-view.js";
export {
  NotificationBell,
  type NotificationBellProps,
  type BellNotification,
  type BellClient,
  type BellKeys,
} from "./notification-bell.js";

// Aperture Pro · v3 — sprite + marketing chrome
export { ApertureSprite, ApIcon } from "./aperture-sprite.js";
export {
  UtilityRule,
  type UtilityRuleProps,
  MegaNav,
  type MegaNavProps,
  type MegaNavLink,
  type MegaColumn,
  type MegaItem,
  MegaFooter,
  type MegaFooterProps,
  type FooterColumn,
  MarketingShell,
  type MarketingShellProps,
} from "./aperture-chrome.js";
