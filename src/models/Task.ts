import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
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

    @Column()
    taskType!: TaskType;

    @Column({ default: 1 })
    stepNumber!: number;

    @ManyToOne(() => Workflow, workflow => workflow.tasks)
    workflow!: Workflow;

    @Column({ type: 'datetime', nullable: true })
    claimedAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    output!: string | null;

    @ManyToMany(() => Task)
    @JoinTable({
        name: 'task_dependencies',
        joinColumn: {
            name: 'taskId',
            referencedColumnName: 'taskId',
        },
        inverseJoinColumn: {
            name: 'dependencyTaskId',
            referencedColumnName: 'taskId',
        },
    })
    dependencies!: Task[];
}