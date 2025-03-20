import { DataSource, Repository } from 'typeorm';
import { Post } from './sample/entities/Post';
import { User } from './sample/entities/User';
import { Student } from './sample/entities/Student';
import { Course } from './sample/entities/Course';
import { FindBoosted } from '../src/find-boosted';
import { FbFn } from '../src/fb-fn';

const db = new DataSource({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  logging: false,
  entities: [Post, User, Student, Course],
});

describe('sample', () => {
  let postRepo: Repository<Post>;
  let userRepo: Repository<User>;
  let studentRepo: Repository<Student>;
  let courseRepo: Repository<Course>;

  beforeEach(async () => {
    await db.initialize();
    postRepo = db.getRepository(Post);
    userRepo = db.getRepository(User);
    studentRepo = db.getRepository(Student);
    courseRepo = db.getRepository(Course);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('fb many-to-one', async () => {
    const user = userRepo.create({ name: 'Bob' });
    await userRepo.save(user);

    const posts = new Array(20).fill(0).map((_, i) => postRepo.create({ title: `Post ${i + 1}`, user }));
    await postRepo.save(posts);

    const fb = new FindBoosted(db, userRepo);
    let r = await fb.execute({ relations: ['posts'] });
    expect(r.data[0].posts.length).toBe(20);

    r = await fb.execute({
      relations: ['posts'],
      where: { name: FbFn.Eq('Bob') },
    });
    expect(r.data.length).toBe(1);
    expect(r.data[0].posts.length).toBe(20);
  });

  test('fb many-to-many', async () => {
    const _courses = ['Math', 'Science', 'Arts'].map((name) => courseRepo.create({ name }));
    const courses = await courseRepo.save(_courses);
    const user = studentRepo.create({ name: 'John', courses });
    const user1 = studentRepo.create({ name: 'Bob', courses: [courses[0]] });
    const user2 = studentRepo.create({ name: 'Mark', courses });
    await studentRepo.save(user);
    await studentRepo.save(user1);
    await studentRepo.save(user2);

    const fb = new FindBoosted(db, studentRepo);
    let r = await fb.execute({
      relations: ['courses'],
      where: {
        courses: { name: FbFn.Eq('Science') },
      },
    });

    expect(r.data[0].courses.find(c => c.name === 'Science')?.name).toBe('Science');
    expect(r.data.length).toBe(2);
  });



  test('fb many-to-many fulltext', async () => {
    const _courses = ['Math', 'Science', 'Arts'].map((name) => courseRepo.create({ name }));
    const courses = await courseRepo.save(_courses);
    const user = studentRepo.create({ name: 'John', courses });
    const user1 = studentRepo.create({ name: 'Bob', courses });
    await studentRepo.save(user);
    await studentRepo.save(user1);

    const fb = new FindBoosted(db, studentRepo);

    let r = await fb.execute({
      fulltextColumns: ['name', 'age'],
      fulltextSearch: 'Bob',
      relations: ['courses'],
    });
    expect(r.data.length).toBe(1);
    expect(r.data[0].name).toBe('Bob');
  });
});
