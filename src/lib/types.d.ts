
export type NewChangeLog = {
  projectId: number;
  cvrId: number;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export type Changelog = {id: number} & NewChangeLog