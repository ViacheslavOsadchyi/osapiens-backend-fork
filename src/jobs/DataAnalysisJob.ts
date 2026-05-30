import { Job } from './Job';
import { Task } from '../models/Task';
import booleanWithin from '@turf/boolean-within';
import { Feature, Polygon } from 'geojson';
import countryMapping from '../data/world_data.json';

export type DataAnalysisJobResult = {
    country: string
}

export class DataAnalysisJob implements Job {
    async run(task: Task): Promise<DataAnalysisJobResult> {
        console.log(`Running data analysis for task ${task.taskId}...`);

        const inputGeometry: Feature<Polygon> = JSON.parse(task.geoJson);

        for (const countryFeature of countryMapping.features) {
            if (countryFeature.geometry.type === 'Polygon' || countryFeature.geometry.type === 'MultiPolygon') {
                const isWithin = booleanWithin(inputGeometry, countryFeature as Feature<Polygon>);
                if (isWithin) {
                    console.log(`The polygon is within ${countryFeature.properties?.name}`);
                    return { country: countryFeature.properties?.name };
                }
            }
        }
        return { country: 'No country found' };
    }
}