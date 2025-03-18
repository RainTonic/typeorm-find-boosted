import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Course } from './Course';

@Entity()
export class Student {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: 10 })
  age: number;

  @ManyToMany(
    () => Course,
    (course) => course.students,
  )
  @JoinTable({
    name: 'student_course',
    joinColumn: {
      name: 'studentId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'courseId',
      referencedColumnName: 'id',
    },
  }) // Required to define the owning side of the relationship
  courses: Course[];
}
