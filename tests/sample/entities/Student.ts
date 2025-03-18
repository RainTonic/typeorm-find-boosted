import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Course } from './Course';

@Entity()
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: 10 })
  age: number;

  @ManyToMany(
    () => Course,
    (course) => course.students,
  )
  @JoinTable({ name: 'student_course' })
  courses: Course[];
}
