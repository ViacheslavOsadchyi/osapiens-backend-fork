import area from '@turf/area';
import { Polygon } from 'geojson';
import { Job } from './Job';
import { Task } from '../models/Task';

export class PolygonAreaJob implements Job {
    async run(task: Task): Promise<string> {
        console.log(`Running polygon area calculation for task ${task.taskId}...`);
        const geoJson = this.parseGeoJson(task);
        const areaSquareMeters = area(geoJson);

        if (!Number.isFinite(areaSquareMeters)) {
            throw new Error(`Failed to calculate polygon area for task ${task.taskId}`);
        }

        console.log(`The polygon area is ${areaSquareMeters} square meters.`);

        return `${areaSquareMeters} square meters`;
    }

    private parseGeoJson(task: Task): Polygon {
        try {
            const geoJson = JSON.parse(task.geoJson);

            if (!this.isPolygonGeometry(geoJson)) {
                throw new Error();
            }

            return geoJson;
        } catch {
            const geoJsonPreview = task.geoJson.length > 200 ? `${task.geoJson.substring(0, 200)}...` : task.geoJson;

            throw new Error(`Invalid polygon GeoJSON for task ${task.taskId}. GeoJSON value: ${geoJsonPreview}`);
        }
    }

    private isPolygonGeometry(value: unknown): value is Polygon {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const geoJson = value as Partial<Polygon>;

        if (geoJson.type !== 'Polygon') {
            return false;
        }

        if (!Array.isArray(geoJson.coordinates)) {
            return false;
        }

        return geoJson.coordinates.every(
            ring =>
                Array.isArray(ring) &&
                ring.every(
                    coordinate =>
                        Array.isArray(coordinate) &&
                        coordinate.length >= 2 &&
                        coordinate.every(value => typeof value === 'number'),
                ),
        );
    }
}