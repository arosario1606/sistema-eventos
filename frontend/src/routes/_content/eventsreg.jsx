import { createFileRoute } from "@tanstack/react-router";
import EventsReg from "../../components/main/content/events/events-reg";

export const Route = createFileRoute("/_content/eventsreg")({
  component: EventsReg,
});
