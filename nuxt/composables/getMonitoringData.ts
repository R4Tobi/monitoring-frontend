type MonitoringData = {
    clients: Array<{
        client_id: string;
        timestamp_unix: number;
        status: {
            last_seen_seconds_ago: number;
            active: boolean;
        };
        payload: {
            client_id: string;
            timestamp_unix: number;
            cpu: {
                arch: string;
                logical_cores: number;
                physical_cores: number;
                freq_mhz_current: number;
                temp_c: number;
                loadavg: {
                    "1": number;
                    "5": number;
                    "15": number;
                };
                cpu_percent_total: number;
            };
            ram: {
                total_bytes: number;
                available_bytes: number;
                used_percent: number;
            };
            disks: Array<{
                device: string;
                mountpoint: string;
                fstype: string;
                total_bytes: number;
                free_bytes: number;
                used_percent: number;
            }>;
            network: {
                hostname: string;
                interfaces: Record<string, string[]>;
            };
            processes: {
                top_cpu: Array<{
                    pid: number;
                    name: string;
                    user: string;
                    cpu_percent: number;
                    rss_bytes: number;
                }>;
                top_mem: Array<{
                    pid: number;
                    name: string;
                    user: string;
                    cpu_percent: number;
                    rss_bytes: number;
                }>;
            };
            os: {
                platform: string;
                kernel: string;
            };
        };
    }>;
};

export const useGetMonitoringData = (hostname: string) => {
    const data = ref<MonitoringData | null>(null);
    const loading = ref(false);
    const error = ref<unknown>(null);

    const fetchMonitoringData = async () => {
        loading.value = true;
        error.value = null;
        try {
            const response = await $fetch<MonitoringData>(`http://${hostname}/api/clients`);
            data.value = response;
        } catch (err) {
            error.value = err;
        } finally {
            loading.value = false;
        }
    };

    const getClientHistory = async (hostname: string, clientId: string) => {
        let data: MonitoringData | null = null;
        try {
            data = await $fetch(`http://${hostname}/api/clients/${clientId}/metrics?limit=2880`);
        } catch (err) {
            error.value = err;
        }
        return data;
    }

    onMounted(() => {
        fetchMonitoringData();
    });

    return {
        data: readonly(data),
        loading: readonly(loading),
        error: readonly(error),
        refresh: fetchMonitoringData,
        getClientHistory,
    };
};