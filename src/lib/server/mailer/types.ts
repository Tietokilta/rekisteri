export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  status: number;
  id: string;
  message: string;
}
