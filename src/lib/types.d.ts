
export interface ChangeLog {
  id: number;
  projectId: number;
  cvrId: number;
  description: string;
  statusId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: number;
  displayId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusLookup {
  id: number;
  status: "Requested" | "Pending" | "Approved" | "Denied" | "Executed" | "Void"
}