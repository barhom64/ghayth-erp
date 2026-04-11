const API_BASE = "/api/careers";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("careers_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `خطأ ${res.status}`);
  }

  return res.json();
}

export const api = {
  register: (data: { name: string; email: string; phone?: string; password: string }) =>
    request<{ token: string; accountId: number }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; accountId: number }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: () => request<{ data: any }>("/me"),

  updateProfile: (data: Record<string, any>) =>
    request<{ message: string }>("/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  getJobs: () => request<{ data: any[] }>("/jobs"),

  getJob: (id: number) => request<{ data: any }>(`/jobs/${id}`),

  apply: (data: { postingId: number; coverLetter?: string }) =>
    request<{ applicationId: number; message: string }>("/apply", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMyApplications: () => request<{ data: any[] }>("/my-applications"),

  updateResume: (resumeUrl: string) =>
    request<{ message: string }>("/me/resume", {
      method: "PATCH",
      body: JSON.stringify({ resumeUrl }),
    }),
};
