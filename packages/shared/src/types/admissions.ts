export interface DocumentOcrResult {
  success: boolean;
  documentType: string;
  extractedData: {
    nationalId?: string;
    familyCardNumber?: string;
    fullName?: string;
    birthPlace?: string;
    birthDate?: string;
  };
  validation: {
    matchScore: number;
    status: "WARNING" | "MISMATCH";
    nationalIdMatch?: boolean;
    familyCardMatch?: boolean;
    fullNameMatch?: boolean;
    notes: string[];
  };
}

export interface DocumentParseRequest {
  imageBase64?: string;
  documentType: "ktp" | "kk" | "akta" | "foto" | "lainnya";
  userInputData?: {
    fullName?: string;
    nationalId?: string;
    familyCardNumber?: string;
    birthDate?: string;
  };
}
