import { DataSource } from 'typeorm';
import { Task } from './models/Task';
import {Workflow} from "./models/Workflow";

export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: 'data/database.sqlite',
    dropSchema: true,
    entities: [Task, Workflow],
    synchronize: true,
    logging: false,
});
