import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("parties/:id", "routes/partie.tsx"),
  route("historique", "routes/historique.tsx"),
] satisfies RouteConfig;
