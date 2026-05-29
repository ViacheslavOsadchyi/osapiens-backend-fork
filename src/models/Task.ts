import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Workflow } from './Workflow';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskType } from '../enums/TaskType.enum';

@Entity({ name: 'tasks' })
export class Task {
    @PrimaryGeneratedColumn('uuid')
    taskId!: string;

    @Column()
    clientId!: string;

    @Column('text')
    geoJson!: string;

    @Column()
    status!: TaskStatus;

    @Column({ nullable: true, type: 'text' })
    progress?: string | null;

    @Column({ nullable: true })
    resultId?: string;

    @Column()
    taskType!: TaskType;

    @Column({ default: 1 })
    stepNumber!: number;

    @ManyToOne(() => Workflow, workflow => workflow.tasks)
    workflow!: Workflow;

    @Column({ type: 'datetime', nullable: true })
    claimedAt!: Date | null;
}