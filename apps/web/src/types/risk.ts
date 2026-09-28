export interface Risk {
  id: string;
  unitId: string;
  unit?: { id: string; name: string };
  academicYearId?: string;
  code: string;
  description: string;
  category: string;
  cause?: string;
  consequence?: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  riskLevel: string;
  ownerId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  mitigations?: RiskMitigation[];
  createdBy?: {
    id: string;
    name: string;
  };
  auditFindings?: {
    id: string;
    severity: string;
  }[];
}

export interface RiskMitigation {
  id: string;
  riskId: string;
  strategy: string;
  actionPlan: string;
  picId?: string;
  deadline?: string;
  isCompleted: boolean;
  progress: number;
  notes?: string;
  createdAt: string;
  pic?: {
    id: string;
    name: string;
  };
}
