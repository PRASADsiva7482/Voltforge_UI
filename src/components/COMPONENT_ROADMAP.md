# Voltforge UI2 Component Roadmap

This folder starts the reusable layer for the fresh Vite rebuild. It uses the old UI only as a feature inventory and the CRM canvas library as a design-system reference, not as copied implementation.

## Built in this pass

- Foundations: `Button`, `IconButton`, `Badge`, `Box`, `Card`, `FieldShell`, `TextInput`, `Textarea`, `SelectField`, `Toggle`, `Tabs`, `SegmentedControl`, `Toolbar`.
- Engineering surfaces: `CodeBlock`, `Terminal`, `DataTable`, `MetricCard`.
- Voltforge product patterns: `ProjectCard`, `BoardCard`, `ExplorerTree`, `PropertyGrid`.
- Workspace shell: `CircuitPlayground` with palette, toolbar, circuit canvas, node selection, inspector, terminal, and oscilloscope preview.
- Auth and shell: Keycloak provider, protected route, app sidebar, topbar, legacy menu map.
- Landing and dashboard: reusable landing sections, hero circuit scene, capability cards, workflow strip, dashboard action cards.

## Next reusable components

- Modal/dialog, confirmation dialog, toast stack, dropdown menu, context menu.
- Split pane, resizable panel group, command palette, breadcrumbs.
- Canvas node renderer, wire renderer, pin dot, bend handle, minimap, zoom controls.
- Monaco code editor wrapper, serial monitor, AI validator panel, BOM panel.
- Project grid filters, board selector, component search, component detail drawer.
- Loading states, skeletons, empty states, error boundary, offline/status banner.
