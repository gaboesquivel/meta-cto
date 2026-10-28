"use client";

import { createContext, useContext } from "react";

import type { GroundedRecord } from "../core/envelope";

export const GenuiRecordContext = createContext<GroundedRecord[]>([]);

export const useGenuiRecords = () => useContext(GenuiRecordContext);
