"use client";

import { createContext, useContext } from "react";

// True only while a real app page is being rendered INSIDE the onboarding tour
// (against the demo store). Components that depend on the live browser/back end
// — e.g. NotificationsSettings, which probes the Push API and would otherwise
// show "your browser doesn't support notifications" inside the tour — read this
// to render a clean, illustrative preview instead.
export const TourContext = createContext(false);
export const useInTour = () => useContext(TourContext);
