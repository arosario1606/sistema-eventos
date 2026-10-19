import { createFileRoute } from "@tanstack/react-router";
import EventsAssist from "../../components/main/content/events/events-assist";

export const Route = createFileRoute("/_content/eventsassist")({
  component: EventsAssist,
});
