// In-memory data stores (replace with DB later)
export interface Client { id: string; name: string; }
export interface User { id: string; clientId: string; email: string; role: 'business_owner' | 'delegate'; }
export interface Report { id: string; clientId: string; name: string; query: string; status: 'idle' | 'running'; startedAt?: string; finishedAt?: string; data?: any; error?: string; }

export const clients: Client[] = [
  { id: 'client_a', name: 'Client A Pest Control' },
  { id: 'client_b', name: 'Client B Field Services' }
];

export const users: User[] = [
  { id: 'user_owner_a', clientId: 'client_a', email: 'ownerA@example.com', role: 'business_owner' },
  { id: 'user_delegate_a1', clientId: 'client_a', email: 'delegateA1@example.com', role: 'delegate' },
  { id: 'user_owner_b', clientId: 'client_b', email: 'ownerB@example.com', role: 'business_owner' }
];

export const reports: Report[] = [
  { id: 'report_1', clientId: 'client_a', name: 'Monthly Service Summary', query: 'monthly_service_summary', status: 'idle' },
  { id: 'report_2', clientId: 'client_a', name: 'Technician Productivity', query: 'tech_productivity', status: 'idle' },
  { id: 'report_3', clientId: 'client_b', name: 'Route Efficiency', query: 'route_efficiency', status: 'idle' }
];
