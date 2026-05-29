export interface Centroid {
  lat: number;
  lng: number;
  name: string;
}

// ISO-3166 alpha-2 → approximate geographic centroid.
export const COUNTRY_CENTROIDS: Record<string, Centroid> = {
  PK: { lat: 30.3753, lng: 69.3451, name: 'Pakistan' },
  US: { lat: 37.0902, lng: -95.7129, name: 'United States' },
  GB: { lat: 55.3781, lng: -3.4360, name: 'United Kingdom' },
  CA: { lat: 56.1304, lng: -106.3468, name: 'Canada' },
  AE: { lat: 23.4241, lng: 53.8478, name: 'United Arab Emirates' },
  SA: { lat: 23.8859, lng: 45.0792, name: 'Saudi Arabia' },
  AU: { lat: -25.2744, lng: 133.7751, name: 'Australia' },
  DE: { lat: 51.1657, lng: 10.4515, name: 'Germany' },
};
