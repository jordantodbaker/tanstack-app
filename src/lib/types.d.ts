
export interface ChangeLog {
  id: number;
  projectId: number;
  cvrId: number;
  description: string;
  statusId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusLookup {
  id: number;
  status: "Requested" | "Pending" | "Approved" | "Denied" | "Executed" | "Void"
}