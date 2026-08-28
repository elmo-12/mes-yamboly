'use client';

import * as React from 'react';
import {
  Activity,
  Bell,
  ClipboardList,
  Download,
  Ellipsis,
  Eye,
  FileSpreadsheet,
  FileText,
  House,
  Inbox,
  Layers,
  LineChart,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Thermometer,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  AlertCard,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  DescriptionList,
  Divider,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  HeatmapCell,
  Icon,
  Input,
  InsightCard,
  KpiCard,
  LineCard,
  ListDetailLayout,
  Modal,
  ModalContent,
  ModalTrigger,
  Overline,
  PageHeader,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
  Radio,
  RadioGroup,
  SectionTitle,
  Select,
  Sidebar,
  SidebarFooterAction,
  Skeleton,
  Spinner,
  Stepper,
  StickyFooter,
  SummaryCard,
  Switch,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  TSelectCell,
  TSelectHead,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea,
  Timeline,
  TimerChip,
  Toaster,
  Tooltip,
  TooltipProvider,
  Topbar,
  toast,
} from '@mes/ui';

/* ------------------------------------------------------------------ helpers */

function Block({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-4 scroll-mt-8">
      <SectionTitle title={title} description={description} />
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Overline>{label}</Overline>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- datos MES */

const SIDEBAR_GROUPS = [
  {
    label: 'Operación',
    items: [
      { href: '/', label: 'Inicio', icon: <House /> },
      { href: '/tiempo-real', label: 'Tiempo real', icon: <Activity /> },
      { href: '/alertas', label: 'Alertas', icon: <Bell />, count: 3 },
      { href: '/pasteurizacion', label: 'Pasteurización', icon: <Thermometer /> },
    ],
  },
  {
    label: 'Control',
    items: [
      { href: '/ordenes', label: 'Órdenes de fabricación', icon: <FileText /> },
      { href: '/reportes', label: 'Reportes', icon: <FileSpreadsheet /> },
      { href: '/analitica', label: 'Analítica IA', icon: <LineChart /> },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/personal', label: 'Personal', icon: <Users /> },
      { href: '/configuracion', label: 'Configuración', icon: <Settings /> },
      { href: '/evidencia', label: 'Evidencia de tesis', icon: <ClipboardList /> },
    ],
  },
];

const FILTER_GROUPS = [
  {
    id: 'periodo',
    label: 'Periodo',
    multiple: false,
    options: [
      { value: 'hoy', label: 'Hoy' },
      { value: 'semana', label: 'Semana' },
      { value: 'mes', label: 'Mes' },
      { value: 'custom', label: 'Personalizado' },
    ],
  },
  {
    id: 'linea',
    label: 'Línea',
    options: [
      { value: 'l1', label: 'L1 Paletas' },
      { value: 'l2', label: 'L2 Conos' },
      { value: 'l3', label: 'L3 Vasos' },
      { value: 'l4', label: 'L4 Sándwich' },
      { value: 'l5', label: 'L5 Bombones' },
    ],
  },
  {
    id: 'turno',
    label: 'Turno',
    options: [
      { value: 'manana', label: 'Mañana' },
      { value: 'tarde', label: 'Tarde' },
      { value: 'noche', label: 'Noche' },
    ],
  },
  {
    id: 'estado',
    label: 'Estado',
    options: [
      { value: 'curso', label: 'En curso', count: 12 },
      { value: 'cerrada', label: 'Cerrada', count: 37 },
      { value: 'validada', label: 'Validada' },
      { value: 'incompleta', label: 'Incompleta', count: 4 },
    ],
  },
];

const ORDENES = [
  { of: 'OF-2026-0815', producto: 'Cono Vainilla 120 ml', linea: 'L2 Conos', turno: 'Mañana', avance: 98, oee: 81.3, estado: 'Por validar', color: 'warning' as const },
  { of: 'OF-2026-0814', producto: 'Paleta Chocolate 80 ml', linea: 'L1 Paletas', turno: 'Mañana', avance: 100, oee: 86.4, estado: 'Validada', color: 'success' as const },
  { of: 'OF-2026-0813', producto: 'Vaso Lúcuma 150 ml', linea: 'L3 Vasos', turno: 'Tarde', avance: 92, oee: 74.8, estado: 'En curso', color: 'informational' as const },
  { of: 'OF-2026-0812', producto: 'Sándwich Clásico', linea: 'L4 Sándwich', turno: 'Noche', avance: 61, oee: 68.2, estado: 'Incompleta', color: 'critical' as const },
  { of: 'OF-2026-0811', producto: 'Bombón Fresa', linea: 'L5 Bombones', turno: 'Tarde', avance: 100, oee: 90.1, estado: 'Cerrada', color: 'neutral' as const },
];

const CAUSAS = ['PM-01 Falla mecánica', 'PE-02 Falla eléctrica', 'PL-03 Limpieza CIP', 'PC-04 Cambio de producto', 'PA-05 Falta de insumo', 'PO-06 Ajuste operativo', 'PS-07 Sin personal'];

const HEATMAP = [
  { causa: 'PM-01 Falla mecánica', valores: [142, 96, 58] },
  { causa: 'PL-03 Limpieza CIP', valores: [40, 96, 72] },
  { causa: 'PC-04 Cambio producto', valores: [88, 34, 12] },
  { causa: 'PA-05 Falta de insumo', valores: [22, 51, 18] },
  { causa: 'PE-02 Falla eléctrica', valores: [8, 12, 37] },
];

/* -------------------------------------------------------------------- page */

export default function DevUiPage() {
  const [filters, setFilters] = React.useState<Record<string, string[]>>({
    periodo: ['semana'],
    linea: ['l2'],
    turno: [],
    estado: [],
  });
  const [selected, setSelected] = React.useState<string[]>(['OF-2026-0815']);
  const [summary, setSummary] = React.useState('todas');
  const [causa, setCausa] = React.useState('PM-01 Falla mecánica');
  const [density, setDensity] = React.useState<'comfortable' | 'standard' | 'compact'>('standard');
  const [afectaOee, setAfectaOee] = React.useState(true);
  const [tipoMerma, setTipoMerma] = React.useState('EP');

  const maxHeat = Math.max(...HEATMAP.flatMap((r) => r.valores));

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <Sidebar
          groups={SIDEBAR_GROUPS}
          activeHref="/tiempo-real"
          user={{ name: 'Carlos Mendoza', role: 'Jefe de producción' }}
          footerActions={
            <>
              <SidebarFooterAction icon={<User />}>Perfil</SidebarFooterAction>
              <SidebarFooterAction icon={<Monitor />}>Modo TV</SidebarFooterAction>
              <SidebarFooterAction icon={<LogOut />}>Salir</SidebarFooterAction>
            </>
          }
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            notificationsCount={3}
            site="Lima"
            user={{ name: 'Carlos Mendoza' }}
            breadcrumb={
              <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: 'Dev' }, { label: 'UI kit' }]} />
            }
          />

          <main
            data-density={density}
            className="flex w-full max-w-app flex-col gap-12 bg-background-main px-8 pt-7 pb-10"
          >
            <PageHeader
              breadcrumb={[{ label: 'Inicio', href: '/' }, { label: 'Dev' }, { label: 'UI kit' }]}
              title="Design System @mes/ui"
              subtitle="Todos los primitives y patrones del MDS con datos de Yamboly · Inter · White First"
              titleSlot={<Badge color="informational" dot>MDS v2.3.1</Badge>}
              actions={
                <>
                  <Button variant="secondary" icon={<Download />}>
                    Exportar
                  </Button>
                  <Button variant="primary" icon={<Plus />}>
                    Nueva orden
                  </Button>
                </>
              }
            />

            {/* ------------------------------------------------------ tipografía */}
            <Block id="tipografia" title="Tipografía y color" description="Escala Inter del MDS y tokens semánticos">
              <div className="flex flex-col gap-2">
                <p className="text-display text-text-primary">Display 40 · Yamboly</p>
                <p className="text-h1 text-text-primary">H1 32 · MES Yamboly</p>
                <p className="text-h2 text-text-primary">H2 24 · Tiempo real</p>
                <p className="text-h3 text-text-primary">H3 20 · Órdenes de fabricación</p>
                <p className="text-h4 text-text-primary">H4 16 · Estado de líneas</p>
                <p className="text-body-lg text-text-primary">Body Large 16 · Control y monitoreo de la producción</p>
                <p className="text-body text-text-primary">Body 14 · L2 Conos · OF-2026-0815 · Turno Mañana</p>
                <p className="text-body-md text-text-primary">Body Medium 14 · Jorge Quispe, maquinista</p>
                <p className="text-body-sm text-text-secondary">Body Small 12 · Actualizado hace 3 s</p>
                <p className="text-caption text-text-secondary">Caption 11 · Sello de tiempo 14:02:41</p>
                <Overline>Overline 11 · Producido</Overline>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['bg-background-subtle text-text-primary border border-border', 'background/subtle'],
                  ['bg-primary text-primary-foreground', 'primary'],
                  ['bg-primary-subtle text-info-text', 'primary/subtle'],
                  ['bg-success text-success-foreground', 'success'],
                  ['bg-success-subtle text-success-text', 'success/subtle'],
                  ['bg-warning text-warning-foreground', 'warning'],
                  ['bg-warning-subtle text-warning-text', 'warning/subtle'],
                  ['bg-error text-error-foreground', 'error'],
                  ['bg-error-subtle text-error-text', 'error/subtle'],
                  ['bg-accent-subtle text-accent-text', 'accent/subtle'],
                  ['bg-neutral-subtle text-neutral-text', 'neutral/subtle'],
                ].map(([cls, name]) => (
                  <span key={name} className={`rounded-sm px-3 py-2 text-body-sm ${cls}`}>
                    {name}
                  </span>
                ))}
              </div>
            </Block>

            <Divider />

            {/* --------------------------------------------------------- Button */}
            <Block id="button" title="Button" description="Hierarchy × Size × Icon × Loading · un solo Primary por pantalla">
              <Row label="Primary / Secondary / Danger">
                <Button variant="primary">Registrar parada</Button>
                <Button variant="secondary">Cancelar</Button>
                <Button variant="danger">Eliminar causa</Button>
                <Button variant="ghost">Ver detalle</Button>
                <Button variant="link">Limpiar filtros</Button>
              </Row>
              <Row label="Tamaños 36 / 40 / 48">
                <Button variant="primary" size="sm">Anterior</Button>
                <Button variant="primary" size="md">Siguiente</Button>
                <Button variant="primary" size="lg">Ingresar</Button>
              </Row>
              <Row label="Iconos leading / trailing / only">
                <Button variant="secondary" icon={<Download />}>Exportar</Button>
                <Button variant="secondary" icon={<Eye />} iconPosition="trailing">Ver evidencia</Button>
                <Button variant="secondary" icon={<Ellipsis />} iconPosition="only" aria-label="Más" />
                <Button variant="secondary" size="sm" icon={<Ellipsis />} iconPosition="only" aria-label="Más" />
                <Button variant="secondary" size="lg" icon={<Ellipsis />} iconPosition="only" aria-label="Más" />
              </Row>
              <Row label="Loading y disabled">
                <Button variant="primary" loading>Guardando</Button>
                <Button variant="secondary" loading>Sincronizando</Button>
                <Button variant="primary" disabled>Validar orden</Button>
                <Button variant="secondary" disabled>Editar</Button>
                <Button variant="danger" disabled>Eliminar</Button>
              </Row>
            </Block>

            <Divider />

            {/* ---------------------------------------------------- Badge / Tag */}
            <Block id="badge" title="Badge y Tag" description="Badge nunca es interactivo; el Tag sí">
              <Row label="Badge · 6 colores">
                <Badge color="neutral">Cerrada</Badge>
                <Badge color="informational">En curso</Badge>
                <Badge color="success">Validada</Badge>
                <Badge color="warning">Por validar</Badge>
                <Badge color="critical">Incompleta</Badge>
                <Badge color="accent">Recomendada</Badge>
              </Row>
              <Row label="Badge con punto">
                <Badge color="success" dot>Produciendo</Badge>
                <Badge color="critical" dot>En parada · 18 min</Badge>
                <Badge color="warning" dot>Riesgo 78 %</Badge>
              </Row>
              <Row label="Tag · sm / md / lg">
                <Tag size="sm">L1 Paletas</Tag>
                <Tag size="md">L2 Conos</Tag>
                <Tag size="lg">L3 Vasos</Tag>
                <Tag size="md" selected>Turno Mañana</Tag>
                <Tag size="md" count={12}>Por validar</Tag>
                <Tag size="md" selected count={37}>Con paradas</Tag>
                <Tag size="md" removable onRemove={() => toast('Filtro quitado')}>PM-01 Falla mecánica</Tag>
                <Tag size="md" disabled>Sin datos</Tag>
              </Row>
            </Block>

            <Divider />

            {/* ------------------------------------------------------ formulario */}
            <Block id="form" title="Formularios" description="Input · Textarea · Select · Checkbox · Radio · Toggle">
              <div className="grid grid-cols-3 gap-6">
                <Input label="N.º de orden" placeholder="OF-2026-0816" hint="Formato OF-AAAA-NNNN" />
                <Input label="Buscar" size="sm" leadingIcon={<Search />} placeholder="Buscar OF, lote o línea…" />
                <Input label="Velocidad real" defaultValue="118" suffix="u/min" hint="Estándar 120 u/min · Desvío −1,7 %" />
                <Input
                  label="Correo o DNI"
                  size="lg"
                  defaultValue="jorge.quispe@yamboly.lat"
                  destructive
                  hint="Correo o contraseña incorrectos"
                />
                <Input label="Sitio" prefix="https://" placeholder="mes.yamboly.lat" />
                <Input label="Deshabilitado" defaultValue="PT-01 Pasteurizador" disabled />
              </div>
              <div className="grid grid-cols-3 gap-6">
                <Select
                  label="Máquina"
                  placeholder="Selecciona máquina"
                  defaultValue="env-l2"
                  options={[
                    { value: 'llen-l1', label: 'Llenadora Tetra Hoyer L1' },
                    { value: 'tunel-l1', label: 'Túnel de frío L1' },
                    { value: 'env-l2', label: 'Envolvedora L2' },
                    { value: 'cod-l3', label: 'Codificadora Domino L3' },
                    { value: 'pt-01', label: 'Pasteurizador PT-01', disabled: true },
                  ]}
                />
                <Select
                  label="Turno"
                  placeholder="Selecciona turno"
                  options={[
                    { value: 'm', label: 'Mañana (06:00–14:00)' },
                    { value: 't', label: 'Tarde (14:00–22:00)' },
                    { value: 'n', label: 'Noche (22:00–06:00)' },
                  ]}
                />
                <Textarea
                  label="Acción tomada"
                  placeholder="Ej.: Se reemplazó cadena y se reajustó tensión"
                  hint="Obligatorio para cerrar la parada"
                />
              </div>
              <div className="flex flex-wrap items-start gap-10">
                <div className="flex flex-col gap-3">
                  <Overline>Checkbox</Overline>
                  <Checkbox label="Producción registrada" supporting="9 840 / 10 000 u" defaultChecked />
                  <Checkbox label="Paradas con causa y acción" defaultChecked />
                  <Checkbox label="Mermas clasificadas" checked="indeterminate" />
                  <Checkbox label="Evidencia de etiqueta" disabled />
                  <Checkbox size="sm" label="Seleccionar todo (sm)" />
                </div>
                <div className="flex flex-col gap-3">
                  <Overline>Radio</Overline>
                  <RadioGroup value={tipoMerma} onValueChange={setTipoMerma}>
                    <Radio value="MP" label="MP · Materia prima" supporting="Antes del proceso" />
                    <Radio value="EP" label="EP · En proceso" supporting="Durante la línea" />
                    <Radio value="PT" label="PT · Producto terminado" />
                    <Radio value="X" label="No aplica" disabled />
                  </RadioGroup>
                </div>
                <div className="flex flex-col gap-3">
                  <Overline>Toggle</Overline>
                  <Switch checked={afectaOee} onCheckedChange={setAfectaOee} label="Afecta OEE" supporting="Se descuenta de Disponibilidad" />
                  <Switch size="sm" label="Notificar por n8n / WhatsApp" defaultChecked />
                  <Switch label="Mostrar en Modo TV" />
                  <Switch label="Bloqueado" disabled defaultChecked />
                </div>
              </div>
            </Block>

            <Divider />

            {/* --------------------------------------------------------- varios */}
            <Block id="misc" title="Avatar, Tooltip, Progress, Skeleton, Spinner, Iconos">
              <Row label="Avatar 24 / 32 / 36">
                <Avatar name="Carlos Mendoza" size={24} />
                <Avatar name="Jorge Quispe" size={32} />
                <Avatar name="Ana Ríos" size={36} />
                <Avatar name="María Torres" size={36} tone="neutral" />
              </Row>
              <Row label="Tooltip">
                <Tooltip content="OEE del turno" supporting="Disponibilidad × Desempeño × Calidad">
                  <Button variant="secondary" size="sm">Pasa el cursor (dark)</Button>
                </Tooltip>
                <Tooltip theme="light" content="Meta 85 %" side="right">
                  <Button variant="secondary" size="sm">Light</Button>
                </Tooltip>
              </Row>
              <Row label="ProgressBar">
                <div className="flex w-64 flex-col gap-2">
                  <ProgressBar value={98} tone="success" />
                  <ProgressBar value={78} tone="primary" />
                  <ProgressBar value={61} tone="warning" />
                  <ProgressBar value={24} tone="error" />
                </div>
              </Row>
              <Row label="Skeleton y Spinner">
                <div className="flex w-72 flex-col gap-2">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Spinner className="text-primary" size={24} />
              </Row>
              <Row label="Iconos (mapa Figma → lucide)">
                {(['home-01', 'activity', 'bell-01', 'ice-cream', 'file-xls', 'insight', 'stop-circle', 'temperature', 'stopwatch'] as const).map((n) => (
                  <span key={n} className="flex flex-col items-center gap-1 text-caption text-text-secondary">
                    <Icon name={n} className="text-text-primary" />
                    {n}
                  </span>
                ))}
              </Row>
            </Block>

            <Divider />

            {/* ----------------------------------------------------------- cards */}
            <Block id="cards" title="Tarjetas funcionales" description="Las únicas cards permitidas por el MDS">
              <div className="flex gap-4">
                <KpiCard label="OEE del día" value="78,4 %" trend="up" delta="+2,1 pp" context="vs ayer" />
                <KpiCard label="Merma" value="2,3 %" trend="down" delta="−0,4 pp" favorable context="vs ayer" />
                <KpiCard label="Paradas no programadas" value="7" trend="up" favorable={false} delta="+2" context="42 min" />
                <KpiCard label="Tiempo medio de registro" value="1,4 min" trend="flat" delta="0,0 %" context="vs pretest" />
              </div>
              <div className="flex gap-4">
                <AlertCard
                  variant="warning"
                  title="L2 Conos · Riesgo de parada en 40 min"
                  description="Probabilidad 78 % · Envolvedora L2 con 3 paradas PM-01 en 7 días"
                  badge={<Badge color="warning">Advertencia</Badge>}
                  actionLabel="Ver alerta"
                />
                <AlertCard
                  variant="critical"
                  title="L4 Sándwich · En parada 18 min"
                  description="PM-01 Falla mecánica · Sin acción registrada"
                  badge={<Badge color="critical">Crítica</Badge>}
                  actionLabel="Atender"
                />
                <AlertCard
                  variant="info"
                  title="L1 Paletas · Velocidad 6 % bajo estándar"
                  description="112 u/min frente a un estándar de 120 u/min"
                  badge={<Badge color="informational">Informativa</Badge>}
                  actionLabel="Ver línea"
                />
              </div>
              <div className="flex gap-4">
                <InsightCard
                  title="Concentración de paradas mecánicas"
                  text="L2 Conos concentra el 34 % de las paradas mecánicas en el turno Tarde."
                  confidence="Confianza 82 %"
                  actionLabel="Ver patrón"
                />
                <InsightCard
                  title="Cambios de producto tardíos"
                  text="Los cambios PC-04 después de las 12:00 duran un 40 % más."
                  confidence="Confianza 76 %"
                />
                <InsightCard
                  title="Merma en arranques"
                  text="La merma EP sube 1,8 pp en arranques con sabor Lúcuma."
                  confidence="Confianza 68 %"
                />
              </div>
              <div className="flex gap-4">
                {[
                  { id: 'todas', label: 'Todas', value: '1 248' },
                  { id: 'validar', label: 'Por validar', value: '12' },
                  { id: 'paradas', label: 'Con paradas', value: '37' },
                  { id: 'mermas', label: 'Con mermas', value: '21' },
                ].map((s) => (
                  <SummaryCard
                    key={s.id}
                    label={s.label}
                    value={s.value}
                    active={summary === s.id}
                    onClick={() => setSummary(s.id)}
                  />
                ))}
              </div>
            </Block>

            <Divider />

            {/* ------------------------------------------------------- Line card */}
            <Block id="linecard" title="Line card" description="356 px · 5 estados · única pantalla con varios Primary">
              <div className="flex flex-wrap gap-6">
                <LineCard
                  line="L1 · Paletas"
                  order="OF-2026-0812 · Paleta Chocolate 80 ml"
                  state="produciendo"
                  metrics={[
                    { label: 'Producido', value: '4 320 u', note: '84 % del objetivo' },
                    { label: 'Velocidad', value: '118 u/min', note: 'objetivo 120' },
                    { label: 'Turno', value: 'Mañana', note: '06:00–14:00' },
                  ]}
                  segments={[{ tone: 'ok' }, { tone: 'micro' }, { tone: 'ok' }, { tone: 'idle' }]}
                />
                <LineCard
                  line="L4 · Sándwich"
                  order="OF-2026-0815 · Sándwich Clásico"
                  state="parada"
                  badgeLabel="En parada · 12 min"
                  metrics={[
                    { label: 'Producido', value: '3 180 u', note: '62 % del objetivo' },
                    { label: 'Velocidad', value: '0 u/min', note: 'objetivo 120' },
                    { label: 'Turno', value: 'Mañana', note: '06:00–14:00' },
                  ]}
                  segments={[{ tone: 'ok' }, { tone: 'micro' }, { tone: 'stop' }, { tone: 'idle' }]}
                />
                <LineCard
                  line="L5 · Bombones"
                  order="Sin orden asignada · Línea disponible"
                  state="sin-orden"
                  metrics={[
                    { label: 'Producido', value: '—', note: 'sin producción' },
                    { label: 'Velocidad', value: '—', note: '—' },
                    { label: 'Turno', value: 'Mañana', note: '06:00–14:00' },
                  ]}
                  segments={[{ tone: 'idle' }]}
                />
                <LineCard
                  line="L2 · Conos"
                  order="OF-2026-0815 · Cono Vainilla 120 ml"
                  state="alerta"
                  badgeLabel="Riesgo de parada 78 %"
                  message="Vibración anómala en llenadora Tetra Hoyer · posible PM-01"
                  metrics={[
                    { label: 'Producido', value: '4 015 u', note: '78 % del objetivo' },
                    { label: 'Velocidad', value: '104 u/min', note: 'objetivo 120' },
                    { label: 'Turno', value: 'Mañana', note: '06:00–14:00' },
                  ]}
                  segments={[{ tone: 'ok' }, { tone: 'micro' }, { tone: 'ok' }, { tone: 'micro' }, { tone: 'idle' }]}
                />
                <LineCard
                  line="L3 · Vasos"
                  order="OF-2026-0813 · Vaso Lúcuma 150 ml"
                  state="sugerida"
                  badgeLabel="Parada detectada por sensor"
                  message="Sin actividad desde las 14:32 · 6 min sin pulsos"
                  metrics={[
                    { label: 'Producido', value: '4 320 u', note: '84 % del objetivo' },
                    { label: 'Velocidad', value: '0 u/min', note: 'objetivo 120' },
                    { label: 'Turno', value: 'Tarde', note: '14:00–22:00' },
                  ]}
                  segments={[{ tone: 'ok' }, { tone: 'micro' }, { tone: 'ok' }, { tone: 'unknown' }, { tone: 'idle' }]}
                />
              </div>
            </Block>

            <Divider />

            {/* ------------------------------------------------- tabs / stepper */}
            <Block id="tabs" title="Tabs, Stepper, Empty state">
              <Tabs defaultValue="resumen">
                <TabsList>
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="paradas" count={4}>Paradas</TabsTrigger>
                  <TabsTrigger value="mermas" count={2}>Mermas</TabsTrigger>
                  <TabsTrigger value="calidad">Calidad</TabsTrigger>
                  <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
                  <TabsTrigger value="off" disabled>Consumo</TabsTrigger>
                </TabsList>
                <TabsContent value="resumen">
                  <p className="text-body text-text-secondary">
                    OF-2026-0815 · Cono Vainilla 120 ml · L2 Conos · Turno Mañana · Maquinista Jorge Quispe.
                  </p>
                </TabsContent>
                <TabsContent value="paradas">
                  <p className="text-body text-text-secondary">4 paradas · 42 min · 3 afectan OEE.</p>
                </TabsContent>
                <TabsContent value="mermas">
                  <p className="text-body text-text-secondary">2 registros de merma EP · 5,4 kg.</p>
                </TabsContent>
                <TabsContent value="calidad">
                  <p className="text-body text-text-secondary">Calidad 98,1 %.</p>
                </TabsContent>
                <TabsContent value="bitacora">
                  <p className="text-body text-text-secondary">12 eventos registrados.</p>
                </TabsContent>
              </Tabs>

              <Tabs defaultValue="ind">
                <TabsList variant="pills">
                  <TabsTrigger value="ind">Indicadores</TabsTrigger>
                  <TabsTrigger value="par">Paradas</TabsTrigger>
                  <TabsTrigger value="mer">Mermas</TabsTrigger>
                  <TabsTrigger value="exp">Exportar</TabsTrigger>
                </TabsList>
                <TabsContent value="ind">
                  <p className="text-body text-text-secondary">Variante Pills del componente MES / Tabs.</p>
                </TabsContent>
                <TabsContent value="par"><p className="text-body text-text-secondary">Pareto de causas.</p></TabsContent>
                <TabsContent value="mer"><p className="text-body text-text-secondary">Merma por línea y tipo.</p></TabsContent>
                <TabsContent value="exp"><p className="text-body text-text-secondary">Datasets exportables.</p></TabsContent>
              </Tabs>

              <div className="max-w-[520px]">
                <Stepper steps={[{ label: 'Causa' }, { label: 'Detalle' }, { label: 'Confirmar' }]} current={1} />
              </div>

              <div className="max-w-[420px]">
                <Stepper
                  orientation="vertical"
                  current={3}
                  steps={[
                    { label: 'Comprensión del negocio', description: 'OEE, paradas y mermas de Yamboly' },
                    { label: 'Comprensión de los datos', description: '2 140 eventos · 14 features' },
                    { label: 'Preparación', description: 'Limpieza y codificación de causas' },
                    { label: 'Modelado', description: 'Gradient Boosting (scikit-learn)' },
                    { label: 'Evaluación', description: 'AUC 0,86 · F1 0,79' },
                    { label: 'Despliegue', description: 'v3.2 activa desde el 24 ago 2026' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-divider pt-6">
                <EmptyState
                  icon={<Inbox />}
                  title="No hay órdenes activas en este turno"
                  description="Inicia una orden para comenzar a registrar producción."
                  action={<Button variant="secondary">Iniciar orden</Button>}
                />
                <EmptyState
                  variant="no-results"
                  icon={<Search />}
                  title="Sin órdenes para los filtros seleccionados"
                  description="Prueba a ampliar el periodo o quitar filtros de línea."
                  action={<Button variant="secondary">Limpiar filtros</Button>}
                />
                <EmptyState
                  variant="insufficient"
                  icon={<Layers />}
                  title="Aún no hay suficientes datos"
                  description="Se necesitan 2 000 eventos para entrenar el modelo."
                  progress={62}
                  progressLabel="1 250 / 2 000 eventos"
                />
              </div>
            </Block>

            <Divider />

            {/* --------------------------------------------------- filtros/tabla */}
            <Block id="tabla" title="Filter bar, tabla integrada y paginación" description="La página es el contenedor: sin card envolvente">
              <FilterBar
                groups={FILTER_GROUPS}
                value={filters}
                onChange={setFilters}
                onClear={() => setFilters({ periodo: [], linea: [], turno: [], estado: [] })}
              />

              <SectionTitle
                title="Detalle de órdenes"
                description="25 por página · 1 248 total"
                actions={
                  <>
                    <Input size="sm" leadingIcon={<Search />} placeholder="Buscar OF, lote, producto" wrapperClassName="w-[260px]" />
                    <Button variant="secondary" size="sm" icon={<SlidersHorizontal />}>Columnas</Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Layers />}
                      onClick={() =>
                        setDensity((d) => (d === 'standard' ? 'compact' : d === 'compact' ? 'comfortable' : 'standard'))
                      }
                    >
                      Densidad: {density}
                    </Button>
                  </>
                }
              />

              <Table density="dense">
                <THead>
                  <tr>
                    <TSelectHead>
                      <Checkbox
                        size="sm"
                        aria-label="Seleccionar todo"
                        checked={selected.length === ORDENES.length ? true : selected.length ? 'indeterminate' : false}
                        onCheckedChange={(v) => setSelected(v === true ? ORDENES.map((o) => o.of) : [])}
                      />
                    </TSelectHead>
                    <TH sortable sortDirection="desc">OF</TH>
                    <TH>Producto</TH>
                    <TH>Línea</TH>
                    <TH>Turno</TH>
                    <TH sortable>Avance</TH>
                    <TH numeric sortable>OEE %</TH>
                    <TH>Estado</TH>
                    <TH aria-label="Acciones" />
                  </tr>
                </THead>
                <TBody>
                  {ORDENES.map((o) => (
                    <TRow key={o.of} selected={selected.includes(o.of)}>
                      <TSelectCell>
                        <Checkbox
                          size="sm"
                          aria-label={`Seleccionar ${o.of}`}
                          checked={selected.includes(o.of)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => (v === true ? [...prev, o.of] : prev.filter((x) => x !== o.of)))
                          }
                        />
                      </TSelectCell>
                      <TCell>
                        <a href="#tabla" className="font-medium text-primary hover:underline">{o.of}</a>
                      </TCell>
                      <TCell>{o.producto}</TCell>
                      <TCell muted>{o.linea}</TCell>
                      <TCell muted>{o.turno}</TCell>
                      <TCell>
                        <div className="flex w-28 flex-col gap-1">
                          <span className="text-caption font-medium text-neutral-text tabular">{o.avance} %</span>
                          <ProgressBar
                            height={4}
                            value={o.avance}
                            tone={o.avance >= 95 ? 'success' : o.avance >= 85 ? 'primary' : 'warning'}
                          />
                        </div>
                      </TCell>
                      <TCell numeric>{o.oee.toFixed(1).replace('.', ',')}</TCell>
                      <TCell>
                        <Badge color={o.color}>{o.estado}</Badge>
                      </TCell>
                      <TCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" icon={<Ellipsis />} iconPosition="only" aria-label={`Acciones de ${o.of}`} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>{o.of}</DropdownMenuLabel>
                            <DropdownMenuItem><Eye /> Ver detalle</DropdownMenuItem>
                            <DropdownMenuItem><Pencil /> Editar</DropdownMenuItem>
                            <DropdownMenuItem><Download /> Exportar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem danger><Trash2 /> Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TCell>
                    </TRow>
                  ))}
                </TBody>
              </Table>

              <Pagination
                page={1}
                pageSize={8}
                total={1248}
                actions={
                  <>
                    <Button variant="secondary" size="sm" disabled>Anterior</Button>
                    <Button variant="secondary" size="sm">Siguiente</Button>
                  </>
                }
              />
            </Block>

            <Divider />

            {/* ------------------------------------------------------- flotantes */}
            <Block id="flotantes" title="Capas flotantes" description="Modal, Drawer, Popover, DropdownMenu y Toaster — las únicas con sombra">
              <Row label="Modal / Drawer / Popover / Toast">
                <Modal>
                  <ModalTrigger asChild>
                    <Button variant="secondary">Modal 640 · captura de parada</Button>
                  </ModalTrigger>
                  <ModalContent
                    size="lg"
                    title="Registrar parada"
                    description="L2 Conos · OF-2026-0815 · Turno Mañana · Jorge Quispe"
                    headerExtra={<TimerChip value="00:23" />}
                    footer={
                      <>
                        <Button variant="secondary">Cancelar</Button>
                        <Button variant="primary">Siguiente</Button>
                      </>
                    }
                  >
                    <div className="flex flex-col gap-5">
                      <Stepper steps={[{ label: 'Causa' }, { label: 'Detalle' }, { label: 'Confirmar' }]} current={0} />
                      <div className="flex flex-col gap-2">
                        <Overline>¿Qué tipo de parada?</Overline>
                        <div className="flex flex-wrap gap-2">
                          {CAUSAS.map((c) => (
                            <Tag key={c} size="lg" selected={causa === c} onClick={() => setCausa(c)}>
                              {c}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <Input label="Hora de inicio" size="sm" defaultValue="14:02" wrapperClassName="w-40" />
                    </div>
                  </ModalContent>
                </Modal>

                <Modal>
                  <ModalTrigger asChild>
                    <Button variant="danger">Modal Danger 480</Button>
                  </ModalTrigger>
                  <ModalContent
                    size="sm"
                    title="¿Eliminar PM-01-03 Rotura de cadena?"
                    footer={
                      <>
                        <Button variant="secondary">Cancelar</Button>
                        <Button variant="danger">Eliminar</Button>
                      </>
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <Overline className="text-error-text">Acción irreversible</Overline>
                      <p className="text-body leading-[22px] text-neutral-text">
                        Hay 14 paradas históricas con esta causa; se conservarán con el código.
                      </p>
                    </div>
                  </ModalContent>
                </Modal>

                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="secondary">Drawer 480 · detalle de línea</Button>
                  </DrawerTrigger>
                  <DrawerContent
                    title="L2 · Conos"
                    description="OF-2026-0815 · Cono Vainilla 120 ml"
                    footer={
                      <>
                        <Button variant="secondary">Descartar</Button>
                        <Button variant="primary">Atender</Button>
                      </>
                    }
                  >
                    <div className="flex flex-col gap-6">
                      <Timeline
                        events={[
                          { time: '06:00', title: 'Inicio de OF-2026-0815', tone: 'primary', badge: <Badge color="informational">Orden</Badge> },
                          { time: '07:42', title: 'Parada PL-03 Limpieza CIP', description: '14 min · Ana Ríos', tone: 'warning', badge: <Badge color="warning">Parada</Badge> },
                          { time: '09:10', title: 'Velocidad 118 u/min', description: 'Estándar 120 u/min', tone: 'success' },
                          { time: '11:05', title: 'Merma EP 3,2 kg', description: 'MR-01 Sobrepeso · María Torres', tone: 'error', badge: <Badge color="critical">Merma</Badge> },
                        ]}
                      />
                      <DescriptionList
                        labelWidth={140}
                        items={[
                          { label: 'Producto', value: 'Cono Vainilla 120 ml' },
                          { label: 'Lote', value: 'L-260828-02' },
                          { label: 'Velocidad estándar', value: '120 u/min' },
                          { label: 'Planificado', value: '10 000 u' },
                          { label: 'Maquinista', value: 'Jorge Quispe' },
                        ]}
                      />
                    </div>
                  </DrawerContent>
                </Drawer>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" icon={<Bell />}>Notificaciones</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0">
                    <div className="flex flex-col">
                      {[
                        ['L2 Conos · Riesgo de parada en 40 min', 'hace 2 min'],
                        ['L4 Sándwich · En parada 18 min', 'hace 12 min'],
                        ['L1 Paletas · Velocidad 6 % bajo estándar', 'hace 25 min'],
                      ].map(([t, m]) => (
                        <div key={t} className="flex flex-col gap-1 border-b border-divider px-4 py-3 last:border-b-0">
                          <span className="text-body-md text-text-primary">{t}</span>
                          <span className="text-body-sm text-text-secondary">{m}</span>
                        </div>
                      ))}
                      <button type="button" className="px-4 py-3 text-left text-body-sm font-medium text-primary hover:underline">
                        Ver todas
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button variant="secondary" onClick={() => toast.success('Parada registrada', { description: 'PM-01 · L2 Conos · 14:02:41' })}>
                  Toast success
                </Button>
                <Button variant="secondary" onClick={() => toast.error('No se pudo guardar', { description: 'Revisa la conexión con el servidor' })}>
                  Toast error
                </Button>
                <Button variant="secondary" onClick={() => toast.warning('Merma sin clasificar', { description: '2 registros pendientes' })}>
                  Toast warning
                </Button>
              </Row>
            </Block>

            <Divider />

            {/* ------------------------------------------------- layout patterns */}
            <Block id="layout" title="Lista-detalle, DescriptionList y Heatmap">
              <ListDetailLayout
                list={
                  <div className="flex flex-col gap-3">
                    <Input size="sm" leadingIcon={<Search />} placeholder="Buscar causa" />
                    <div className="flex flex-col">
                      {CAUSAS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCausa(c)}
                          className={`flex h-11 items-center rounded-sm px-3 text-left text-body ${
                            causa === c ? 'bg-primary-subtle text-info-text' : 'text-text-secondary hover:bg-background-subtle'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <Button variant="primary" size="sm" icon={<Plus />}>Nueva causa</Button>
                  </div>
                }
                detail={
                  <div className="flex flex-col gap-4">
                    <SectionTitle title={causa} description="Catálogo maestro de causas de parada" />
                    <DescriptionList
                      items={[
                        { label: 'Código', value: 'PM-01-03' },
                        { label: 'Tipo', value: 'No programada' },
                        { label: 'Categoría general', value: 'Falla mecánica' },
                        { label: 'Afecta OEE', value: <Switch defaultChecked aria-label="Afecta OEE" /> },
                        { label: 'Requiere evidencia', value: <Switch aria-label="Requiere evidencia" /> },
                        { label: 'Tiempo estándar', value: '18 min' },
                        {
                          label: 'Líneas aplicables',
                          value: (
                            <div className="flex flex-wrap gap-2">
                              <Tag size="md" selected>L1 Paletas</Tag>
                              <Tag size="md" selected>L2 Conos</Tag>
                              <Tag size="md">L3 Vasos</Tag>
                            </div>
                          ),
                        },
                      ]}
                    />
                  </div>
                }
              />

              <div className="flex flex-col gap-2">
                <Overline>Heatmap causa × turno (minutos)</Overline>
                <div className="grid max-w-[560px] grid-cols-[220px_repeat(3,1fr)] gap-2">
                  <span />
                  {['Mañana', 'Tarde', 'Noche'].map((t) => (
                    <span key={t} className="text-center text-overline text-text-disabled uppercase">{t}</span>
                  ))}
                  {HEATMAP.map((r) => (
                    <React.Fragment key={r.causa}>
                      <span className="flex items-center text-body-sm text-text-secondary">{r.causa}</span>
                      {r.valores.map((v, i) => (
                        <HeatmapCell key={i} value={v} max={maxHeat} label={`${r.causa} · ${v} min`} />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </Block>

            <StickyFooter
              message="Cambios sin guardar"
              actions={
                <>
                  <Button variant="secondary">Cancelar</Button>
                  <Button variant="primary">Guardar</Button>
                </>
              }
            />
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
