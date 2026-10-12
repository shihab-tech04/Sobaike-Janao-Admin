# Sobaike Admin Design System — Component Documentation

This design system establishes a high-density, enterprise-grade, civic/government-aligned administrative component library adhering strictly to Convay operational guidelines and Sobaike visual identity.

---

## 1. Tokens & Theme Foundations (`src/themes/`)

- **Colors (`tokens.ts`, `light.ts`, `dark.ts`)**: Sobaike civic blue (`#0284c7`), high-contrast dark palette (`#090d16` background, `#0f172a` surfaces), complete semantic status palettes (Success, Warning, Error, Info, Pending, Review, Approved, Published, Resolved, Rejected).
- **Spacing Scale**: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px.
- **Typography**: Bengali & English dual support with `Hind Siliguri`, `Noto Sans Bengali`, and system sans-serif hierarchy.
- **Radius**: `small` (4px), `medium` (8px), `large` (12px), `full` (9999px).
- **Shadows**: `small`, `medium`, `large` (subtle elevation without glowing halos).

---

## 2. Base Components

### Button (`Button.tsx`)
- **Purpose**: Primary interactive trigger for administrative actions.
- **Variants**: `primary`, `secondary`, `ghost`, `danger`, `success`.
- **Sizes**: `sm` (32px), `md` (36px), `lg` (44px).
- **States**: Default, Hover, Focus-visible, Disabled, Loading (with spinner).
- **Props**: `variant`, `size`, `isLoading`, `leftIcon`, `rightIcon`, `fullWidth`.
- **Usage**:
  ```tsx
  <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
    Create Entry
  </Button>
  ```

### Input (`Input.tsx`)
- **Purpose**: Text and data entry fields.
- **Features**: Built-in label, error message, helper text, prefix/suffix icons, search mode with icon, clear button, and password show/hide toggle.
- **States**: Default, Focus-visible, Disabled, Error.
- **Usage**:
  ```tsx
  <Input
    label="Official Email"
    type="email"
    placeholder="admin@example.com"
    helperText="Enter your official verified email"
    error={errors.email}
  />
  ```

### Select (`Select.tsx`)
- **Purpose**: Single selection dropdown with native accessibility and custom enterprise styling.
- **Props**: `label`, `error`, `helperText`, `options`, `placeholder`.
- **Usage**:
  ```tsx
  <Select
    label="Department"
    placeholder="Select department..."
    options={[
      { value: 'roads', label: 'Roads & Infrastructure' },
      { value: 'health', label: 'Public Health' },
    ]}
  />
  ```

### Textarea (`Textarea.tsx`)
- **Purpose**: Multi-line text entry with optional character counter and resize constraints.
- **Props**: `label`, `error`, `helperText`, `charCount`, `maxCharCount`, `rows`.

### Checkbox (`Checkbox.tsx`)
- **Purpose**: Binary or indeterminate multi-selection control.
- **Props**: `label`, `description`, `indeterminate`, `checked`, `disabled`.

### Radio & RadioGroup (`Radio.tsx`)
- **Purpose**: Single selection among a mutually exclusive list with context management.
- **Props**: `name`, `value`, `orientation` (`horizontal` | `vertical`), `label`, `description`.

### Switch (`Switch.tsx`)
- **Purpose**: Instant toggle for administrative feature flags and state triggers.
- **Props**: `checked`, `onChange`, `label`, `description`, `size` (`sm` | `md`).

### Badge (`Badge.tsx`)
- **Purpose**: High-contrast status badges for operational complaint workflow.
- **Statuses**: `pending`, `review`, `approved`, `published`, `resolved`, `rejected`, `info`, `default`.
- **Variants**: `subtle`, `solid`, `outline`.
- **Props**: `status`, `variant`, `size` (`sm` | `md`), `dot` (boolean indicator).
- **Usage**:
  ```tsx
  <Badge status="resolved" variant="subtle" dot>
    Resolved
  </Badge>
  ```

### Card (`Card.tsx`)
- **Purpose**: Structural container for grouping related administrative information.
- **Sub-components**: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- **Variants**: `default`, `interactive`, `highlighted`.

### Divider (`Divider.tsx`)
- **Purpose**: Visual separation between dense administrative sections.
- **Props**: `orientation` (`horizontal` | `vertical`), `label`.

### Tooltip (`Tooltip.tsx`)
- **Purpose**: Contextual helper on hover and focus.
- **Props**: `content`, `position` (`top` | `bottom` | `left` | `right`), `delay`.

---

## 3. Admin-Specific Components

### Table Foundation (`Table.tsx`)
- **Components**: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`.
- **Helpers**:
  - `TableHead` with `sortable`, `sortDirection` (`asc` | `desc`), and `onSort`.
  - `TableLoadingRow` for asynchronous fetches.
  - `TableEmptyRow` with configurable title, description, and action button.
  - `TablePagination` with page size selector, previous/next controls, and item counts.

### Drawer Foundation (`Drawer.tsx`)
- **Purpose**: Slide-over panel for viewing detail records, complaint inspections, and side edits.
- **Props**: `isOpen`, `onClose`, `title`, `description`, `footer`, `position` (`left` | `right`), `size` (`sm` | `md` | `lg` | `xl`).
- **Accessibility**: Trapped focus, backdrop dismiss, ESC key handler.

### Modal Foundation (`Modal.tsx`)
- **Purpose**: Focused dialog for destructive confirmations, critical actions, and creation flows.
- **Props**: `isOpen`, `onClose`, `title`, `description`, `footer`, `size` (`sm` | `md` | `lg` | `xl`).
- **Accessibility**: ESC listener, animated backdrop, aria-modal semantics.

### PageHeader (`PageHeader.tsx`)
- **Purpose**: Standardized administrative view heading with breadcrumbs navigation, title, description, back button, and action slots.
