import { createFileRoute } from "@tanstack/react-router";
import Events from "../../components/main/content/events/events";

export const Route = createFileRoute("/_content/events")({
  component: Events,
});
