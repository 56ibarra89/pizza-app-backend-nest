export type AppConfigEntity = {
  id: string;
  data: unknown;
  createdById?: string;
  updatedById?: string;
  createdAt: Date;
  updatedAt: Date;
};
