import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { Account, ApproveLeaveBody, AttendanceRecord, CheckInBody, CheckInResponse, Client, CreateClientBody, CreateClientResponse, CreateEmployeeBody, CreateEmployeeResponse, CreateInvoiceBody, CreateInvoiceResponse, DashboardData, DashboardSummary, Employee, EmployeeDetail, FinanceStats, GetAttendanceParams, HealthStatus, Invoice, LeaveBalance, LeaveRequest, LeaveType, ListClientsParams, ListEmployeesParams, ListInvoicesParams, ListLeaveRequestsParams, ListTasksParams, LoginBody, LoginResponse, Notification, PaymentResponse, PayrollRun, PayrollRunResult, RecordPaymentBody, RequestLeaveBody, RequestLeaveResponse, RunPayrollBody, SuccessResponse, Task, UserProfile } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Login
 */
export declare const getLoginUrl: () => string;
export declare const login: (loginBody: LoginBody, options?: RequestInit) => Promise<LoginResponse>;
export declare const getLoginMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginBody>;
}, TContext>;
export type LoginMutationResult = NonNullable<Awaited<ReturnType<typeof login>>>;
export type LoginMutationBody = BodyType<LoginBody>;
export type LoginMutationError = ErrorType<unknown>;
/**
 * @summary Login
 */
export declare const useLogin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginBody>;
}, TContext>;
/**
 * @summary Get current user
 */
export declare const getGetMeUrl: () => string;
export declare const getMe: (options?: RequestInit) => Promise<UserProfile>;
export declare const getGetMeQueryKey: () => readonly ["/api/auth/me"];
export declare const getGetMeQueryOptions: <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMeQueryResult = NonNullable<Awaited<ReturnType<typeof getMe>>>;
export type GetMeQueryError = ErrorType<unknown>;
/**
 * @summary Get current user
 */
export declare function useGetMe<TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get dashboard stats
 */
export declare const getGetDashboardUrl: () => string;
export declare const getDashboard: (options?: RequestInit) => Promise<DashboardData>;
export declare const getGetDashboardQueryKey: () => readonly ["/api/dashboard"];
export declare const getGetDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;
export type GetDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard stats
 */
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get quick stats summary
 */
export declare const getGetDashboardSummaryUrl: () => string;
export declare const getDashboardSummary: (options?: RequestInit) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: () => readonly ["/api/dashboard/summary"];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get quick stats summary
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List employees
 */
export declare const getListEmployeesUrl: (params?: ListEmployeesParams) => string;
export declare const listEmployees: (params?: ListEmployeesParams, options?: RequestInit) => Promise<Employee[]>;
export declare const getListEmployeesQueryKey: (params?: ListEmployeesParams) => readonly ["/api/employees", ...ListEmployeesParams[]];
export declare const getListEmployeesQueryOptions: <TData = Awaited<ReturnType<typeof listEmployees>>, TError = ErrorType<unknown>>(params?: ListEmployeesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listEmployees>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listEmployees>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListEmployeesQueryResult = NonNullable<Awaited<ReturnType<typeof listEmployees>>>;
export type ListEmployeesQueryError = ErrorType<unknown>;
/**
 * @summary List employees
 */
export declare function useListEmployees<TData = Awaited<ReturnType<typeof listEmployees>>, TError = ErrorType<unknown>>(params?: ListEmployeesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listEmployees>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create employee
 */
export declare const getCreateEmployeeUrl: () => string;
export declare const createEmployee: (createEmployeeBody: CreateEmployeeBody, options?: RequestInit) => Promise<CreateEmployeeResponse>;
export declare const getCreateEmployeeMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createEmployee>>, TError, {
        data: BodyType<CreateEmployeeBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createEmployee>>, TError, {
    data: BodyType<CreateEmployeeBody>;
}, TContext>;
export type CreateEmployeeMutationResult = NonNullable<Awaited<ReturnType<typeof createEmployee>>>;
export type CreateEmployeeMutationBody = BodyType<CreateEmployeeBody>;
export type CreateEmployeeMutationError = ErrorType<unknown>;
/**
 * @summary Create employee
 */
export declare const useCreateEmployee: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createEmployee>>, TError, {
        data: BodyType<CreateEmployeeBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createEmployee>>, TError, {
    data: BodyType<CreateEmployeeBody>;
}, TContext>;
/**
 * @summary Get employee by ID
 */
export declare const getGetEmployeeUrl: (id: number) => string;
export declare const getEmployee: (id: number, options?: RequestInit) => Promise<EmployeeDetail>;
export declare const getGetEmployeeQueryKey: (id: number) => readonly [`/api/employees/${number}`];
export declare const getGetEmployeeQueryOptions: <TData = Awaited<ReturnType<typeof getEmployee>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEmployee>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEmployee>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEmployeeQueryResult = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;
export type GetEmployeeQueryError = ErrorType<unknown>;
/**
 * @summary Get employee by ID
 */
export declare function useGetEmployee<TData = Awaited<ReturnType<typeof getEmployee>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEmployee>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List clients
 */
export declare const getListClientsUrl: (params?: ListClientsParams) => string;
export declare const listClients: (params?: ListClientsParams, options?: RequestInit) => Promise<Client[]>;
export declare const getListClientsQueryKey: (params?: ListClientsParams) => readonly ["/api/clients", ...ListClientsParams[]];
export declare const getListClientsQueryOptions: <TData = Awaited<ReturnType<typeof listClients>>, TError = ErrorType<unknown>>(params?: ListClientsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListClientsQueryResult = NonNullable<Awaited<ReturnType<typeof listClients>>>;
export type ListClientsQueryError = ErrorType<unknown>;
/**
 * @summary List clients
 */
export declare function useListClients<TData = Awaited<ReturnType<typeof listClients>>, TError = ErrorType<unknown>>(params?: ListClientsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create client
 */
export declare const getCreateClientUrl: () => string;
export declare const createClient: (createClientBody: CreateClientBody, options?: RequestInit) => Promise<CreateClientResponse>;
export declare const getCreateClientMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createClient>>, TError, {
        data: BodyType<CreateClientBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createClient>>, TError, {
    data: BodyType<CreateClientBody>;
}, TContext>;
export type CreateClientMutationResult = NonNullable<Awaited<ReturnType<typeof createClient>>>;
export type CreateClientMutationBody = BodyType<CreateClientBody>;
export type CreateClientMutationError = ErrorType<unknown>;
/**
 * @summary Create client
 */
export declare const useCreateClient: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createClient>>, TError, {
        data: BodyType<CreateClientBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createClient>>, TError, {
    data: BodyType<CreateClientBody>;
}, TContext>;
/**
 * @summary Get client by ID
 */
export declare const getGetClientUrl: (id: number) => string;
export declare const getClient: (id: number, options?: RequestInit) => Promise<Client>;
export declare const getGetClientQueryKey: (id: number) => readonly [`/api/clients/${number}`];
export declare const getGetClientQueryOptions: <TData = Awaited<ReturnType<typeof getClient>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetClientQueryResult = NonNullable<Awaited<ReturnType<typeof getClient>>>;
export type GetClientQueryError = ErrorType<unknown>;
/**
 * @summary Get client by ID
 */
export declare function useGetClient<TData = Awaited<ReturnType<typeof getClient>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Record attendance check-in
 */
export declare const getCheckInUrl: () => string;
export declare const checkIn: (checkInBody: CheckInBody, options?: RequestInit) => Promise<CheckInResponse>;
export declare const getCheckInMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof checkIn>>, TError, {
        data: BodyType<CheckInBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof checkIn>>, TError, {
    data: BodyType<CheckInBody>;
}, TContext>;
export type CheckInMutationResult = NonNullable<Awaited<ReturnType<typeof checkIn>>>;
export type CheckInMutationBody = BodyType<CheckInBody>;
export type CheckInMutationError = ErrorType<unknown>;
/**
 * @summary Record attendance check-in
 */
export declare const useCheckIn: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof checkIn>>, TError, {
        data: BodyType<CheckInBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof checkIn>>, TError, {
    data: BodyType<CheckInBody>;
}, TContext>;
/**
 * @summary Get attendance records
 */
export declare const getGetAttendanceUrl: (params?: GetAttendanceParams) => string;
export declare const getAttendance: (params?: GetAttendanceParams, options?: RequestInit) => Promise<AttendanceRecord[]>;
export declare const getGetAttendanceQueryKey: (params?: GetAttendanceParams) => readonly ["/api/hr/attendance", ...GetAttendanceParams[]];
export declare const getGetAttendanceQueryOptions: <TData = Awaited<ReturnType<typeof getAttendance>>, TError = ErrorType<unknown>>(params?: GetAttendanceParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAttendance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAttendance>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAttendanceQueryResult = NonNullable<Awaited<ReturnType<typeof getAttendance>>>;
export type GetAttendanceQueryError = ErrorType<unknown>;
/**
 * @summary Get attendance records
 */
export declare function useGetAttendance<TData = Awaited<ReturnType<typeof getAttendance>>, TError = ErrorType<unknown>>(params?: GetAttendanceParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAttendance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List leave types
 */
export declare const getListLeaveTypesUrl: () => string;
export declare const listLeaveTypes: (options?: RequestInit) => Promise<LeaveType[]>;
export declare const getListLeaveTypesQueryKey: () => readonly ["/api/hr/leave-types"];
export declare const getListLeaveTypesQueryOptions: <TData = Awaited<ReturnType<typeof listLeaveTypes>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLeaveTypes>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listLeaveTypes>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListLeaveTypesQueryResult = NonNullable<Awaited<ReturnType<typeof listLeaveTypes>>>;
export type ListLeaveTypesQueryError = ErrorType<unknown>;
/**
 * @summary List leave types
 */
export declare function useListLeaveTypes<TData = Awaited<ReturnType<typeof listLeaveTypes>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLeaveTypes>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get leave balances
 */
export declare const getGetLeaveBalanceUrl: () => string;
export declare const getLeaveBalance: (options?: RequestInit) => Promise<LeaveBalance[]>;
export declare const getGetLeaveBalanceQueryKey: () => readonly ["/api/hr/leave-balance"];
export declare const getGetLeaveBalanceQueryOptions: <TData = Awaited<ReturnType<typeof getLeaveBalance>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLeaveBalance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getLeaveBalance>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetLeaveBalanceQueryResult = NonNullable<Awaited<ReturnType<typeof getLeaveBalance>>>;
export type GetLeaveBalanceQueryError = ErrorType<unknown>;
/**
 * @summary Get leave balances
 */
export declare function useGetLeaveBalance<TData = Awaited<ReturnType<typeof getLeaveBalance>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLeaveBalance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List leave requests
 */
export declare const getListLeaveRequestsUrl: (params?: ListLeaveRequestsParams) => string;
export declare const listLeaveRequests: (params?: ListLeaveRequestsParams, options?: RequestInit) => Promise<LeaveRequest[]>;
export declare const getListLeaveRequestsQueryKey: (params?: ListLeaveRequestsParams) => readonly ["/api/hr/leave-requests", ...ListLeaveRequestsParams[]];
export declare const getListLeaveRequestsQueryOptions: <TData = Awaited<ReturnType<typeof listLeaveRequests>>, TError = ErrorType<unknown>>(params?: ListLeaveRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLeaveRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listLeaveRequests>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListLeaveRequestsQueryResult = NonNullable<Awaited<ReturnType<typeof listLeaveRequests>>>;
export type ListLeaveRequestsQueryError = ErrorType<unknown>;
/**
 * @summary List leave requests
 */
export declare function useListLeaveRequests<TData = Awaited<ReturnType<typeof listLeaveRequests>>, TError = ErrorType<unknown>>(params?: ListLeaveRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLeaveRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Submit leave request
 */
export declare const getRequestLeaveUrl: () => string;
export declare const requestLeave: (requestLeaveBody: RequestLeaveBody, options?: RequestInit) => Promise<RequestLeaveResponse>;
export declare const getRequestLeaveMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestLeave>>, TError, {
        data: BodyType<RequestLeaveBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof requestLeave>>, TError, {
    data: BodyType<RequestLeaveBody>;
}, TContext>;
export type RequestLeaveMutationResult = NonNullable<Awaited<ReturnType<typeof requestLeave>>>;
export type RequestLeaveMutationBody = BodyType<RequestLeaveBody>;
export type RequestLeaveMutationError = ErrorType<unknown>;
/**
 * @summary Submit leave request
 */
export declare const useRequestLeave: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestLeave>>, TError, {
        data: BodyType<RequestLeaveBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof requestLeave>>, TError, {
    data: BodyType<RequestLeaveBody>;
}, TContext>;
/**
 * @summary Approve or reject leave request
 */
export declare const getApproveLeaveUrl: (id: number) => string;
export declare const approveLeave: (id: number, approveLeaveBody: ApproveLeaveBody, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getApproveLeaveMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approveLeave>>, TError, {
        id: number;
        data: BodyType<ApproveLeaveBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof approveLeave>>, TError, {
    id: number;
    data: BodyType<ApproveLeaveBody>;
}, TContext>;
export type ApproveLeaveMutationResult = NonNullable<Awaited<ReturnType<typeof approveLeave>>>;
export type ApproveLeaveMutationBody = BodyType<ApproveLeaveBody>;
export type ApproveLeaveMutationError = ErrorType<unknown>;
/**
 * @summary Approve or reject leave request
 */
export declare const useApproveLeave: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approveLeave>>, TError, {
        id: number;
        data: BodyType<ApproveLeaveBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof approveLeave>>, TError, {
    id: number;
    data: BodyType<ApproveLeaveBody>;
}, TContext>;
/**
 * @summary List payroll runs
 */
export declare const getListPayrollRunsUrl: () => string;
export declare const listPayrollRuns: (options?: RequestInit) => Promise<PayrollRun[]>;
export declare const getListPayrollRunsQueryKey: () => readonly ["/api/hr/payroll"];
export declare const getListPayrollRunsQueryOptions: <TData = Awaited<ReturnType<typeof listPayrollRuns>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPayrollRuns>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPayrollRuns>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPayrollRunsQueryResult = NonNullable<Awaited<ReturnType<typeof listPayrollRuns>>>;
export type ListPayrollRunsQueryError = ErrorType<unknown>;
/**
 * @summary List payroll runs
 */
export declare function useListPayrollRuns<TData = Awaited<ReturnType<typeof listPayrollRuns>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPayrollRuns>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Run payroll for a period
 */
export declare const getRunPayrollUrl: () => string;
export declare const runPayroll: (runPayrollBody: RunPayrollBody, options?: RequestInit) => Promise<PayrollRunResult>;
export declare const getRunPayrollMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof runPayroll>>, TError, {
        data: BodyType<RunPayrollBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof runPayroll>>, TError, {
    data: BodyType<RunPayrollBody>;
}, TContext>;
export type RunPayrollMutationResult = NonNullable<Awaited<ReturnType<typeof runPayroll>>>;
export type RunPayrollMutationBody = BodyType<RunPayrollBody>;
export type RunPayrollMutationError = ErrorType<unknown>;
/**
 * @summary Run payroll for a period
 */
export declare const useRunPayroll: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof runPayroll>>, TError, {
        data: BodyType<RunPayrollBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof runPayroll>>, TError, {
    data: BodyType<RunPayrollBody>;
}, TContext>;
/**
 * @summary List invoices
 */
export declare const getListInvoicesUrl: (params?: ListInvoicesParams) => string;
export declare const listInvoices: (params?: ListInvoicesParams, options?: RequestInit) => Promise<Invoice[]>;
export declare const getListInvoicesQueryKey: (params?: ListInvoicesParams) => readonly ["/api/finance/invoices", ...ListInvoicesParams[]];
export declare const getListInvoicesQueryOptions: <TData = Awaited<ReturnType<typeof listInvoices>>, TError = ErrorType<unknown>>(params?: ListInvoicesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInvoices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listInvoices>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListInvoicesQueryResult = NonNullable<Awaited<ReturnType<typeof listInvoices>>>;
export type ListInvoicesQueryError = ErrorType<unknown>;
/**
 * @summary List invoices
 */
export declare function useListInvoices<TData = Awaited<ReturnType<typeof listInvoices>>, TError = ErrorType<unknown>>(params?: ListInvoicesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInvoices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create invoice
 */
export declare const getCreateInvoiceUrl: () => string;
export declare const createInvoice: (createInvoiceBody: CreateInvoiceBody, options?: RequestInit) => Promise<CreateInvoiceResponse>;
export declare const getCreateInvoiceMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInvoice>>, TError, {
        data: BodyType<CreateInvoiceBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createInvoice>>, TError, {
    data: BodyType<CreateInvoiceBody>;
}, TContext>;
export type CreateInvoiceMutationResult = NonNullable<Awaited<ReturnType<typeof createInvoice>>>;
export type CreateInvoiceMutationBody = BodyType<CreateInvoiceBody>;
export type CreateInvoiceMutationError = ErrorType<unknown>;
/**
 * @summary Create invoice
 */
export declare const useCreateInvoice: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInvoice>>, TError, {
        data: BodyType<CreateInvoiceBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createInvoice>>, TError, {
    data: BodyType<CreateInvoiceBody>;
}, TContext>;
/**
 * @summary Record invoice payment
 */
export declare const getRecordPaymentUrl: (id: number) => string;
export declare const recordPayment: (id: number, recordPaymentBody: RecordPaymentBody, options?: RequestInit) => Promise<PaymentResponse>;
export declare const getRecordPaymentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof recordPayment>>, TError, {
        id: number;
        data: BodyType<RecordPaymentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof recordPayment>>, TError, {
    id: number;
    data: BodyType<RecordPaymentBody>;
}, TContext>;
export type RecordPaymentMutationResult = NonNullable<Awaited<ReturnType<typeof recordPayment>>>;
export type RecordPaymentMutationBody = BodyType<RecordPaymentBody>;
export type RecordPaymentMutationError = ErrorType<unknown>;
/**
 * @summary Record invoice payment
 */
export declare const useRecordPayment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof recordPayment>>, TError, {
        id: number;
        data: BodyType<RecordPaymentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof recordPayment>>, TError, {
    id: number;
    data: BodyType<RecordPaymentBody>;
}, TContext>;
/**
 * @summary Get chart of accounts
 */
export declare const getGetChartOfAccountsUrl: () => string;
export declare const getChartOfAccounts: (options?: RequestInit) => Promise<Account[]>;
export declare const getGetChartOfAccountsQueryKey: () => readonly ["/api/finance/chart-of-accounts"];
export declare const getGetChartOfAccountsQueryOptions: <TData = Awaited<ReturnType<typeof getChartOfAccounts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getChartOfAccounts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getChartOfAccounts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetChartOfAccountsQueryResult = NonNullable<Awaited<ReturnType<typeof getChartOfAccounts>>>;
export type GetChartOfAccountsQueryError = ErrorType<unknown>;
/**
 * @summary Get chart of accounts
 */
export declare function useGetChartOfAccounts<TData = Awaited<ReturnType<typeof getChartOfAccounts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getChartOfAccounts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get finance statistics
 */
export declare const getGetFinanceStatsUrl: () => string;
export declare const getFinanceStats: (options?: RequestInit) => Promise<FinanceStats>;
export declare const getGetFinanceStatsQueryKey: () => readonly ["/api/finance/stats"];
export declare const getGetFinanceStatsQueryOptions: <TData = Awaited<ReturnType<typeof getFinanceStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFinanceStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFinanceStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFinanceStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getFinanceStats>>>;
export type GetFinanceStatsQueryError = ErrorType<unknown>;
/**
 * @summary Get finance statistics
 */
export declare function useGetFinanceStats<TData = Awaited<ReturnType<typeof getFinanceStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFinanceStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List notifications
 */
export declare const getListNotificationsUrl: () => string;
export declare const listNotifications: (options?: RequestInit) => Promise<Notification[]>;
export declare const getListNotificationsQueryKey: () => readonly ["/api/notifications"];
export declare const getListNotificationsQueryOptions: <TData = Awaited<ReturnType<typeof listNotifications>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListNotificationsQueryResult = NonNullable<Awaited<ReturnType<typeof listNotifications>>>;
export type ListNotificationsQueryError = ErrorType<unknown>;
/**
 * @summary List notifications
 */
export declare function useListNotifications<TData = Awaited<ReturnType<typeof listNotifications>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Mark notification as read
 */
export declare const getMarkNotificationReadUrl: (id: number) => string;
export declare const markNotificationRead: (id: number, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getMarkNotificationReadMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markNotificationRead>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof markNotificationRead>>, TError, {
    id: number;
}, TContext>;
export type MarkNotificationReadMutationResult = NonNullable<Awaited<ReturnType<typeof markNotificationRead>>>;
export type MarkNotificationReadMutationError = ErrorType<unknown>;
/**
 * @summary Mark notification as read
 */
export declare const useMarkNotificationRead: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markNotificationRead>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof markNotificationRead>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List tasks
 */
export declare const getListTasksUrl: (params?: ListTasksParams) => string;
export declare const listTasks: (params?: ListTasksParams, options?: RequestInit) => Promise<Task[]>;
export declare const getListTasksQueryKey: (params?: ListTasksParams) => readonly ["/api/tasks", ...ListTasksParams[]];
export declare const getListTasksQueryOptions: <TData = Awaited<ReturnType<typeof listTasks>>, TError = ErrorType<unknown>>(params?: ListTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTasksQueryResult = NonNullable<Awaited<ReturnType<typeof listTasks>>>;
export type ListTasksQueryError = ErrorType<unknown>;
/**
 * @summary List tasks
 */
export declare function useListTasks<TData = Awaited<ReturnType<typeof listTasks>>, TError = ErrorType<unknown>>(params?: ListTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map