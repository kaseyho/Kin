export type NetworkStatus = 'online' | 'offline' | 'reconnecting';

export interface ConnectivityService {
  getCurrentStatus(): Promise<NetworkStatus>;
  subscribe(listener: (status: NetworkStatus) => void): () => void;
}
