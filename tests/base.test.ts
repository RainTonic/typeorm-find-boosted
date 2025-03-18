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

  test('basic insert functionality', async () => {
    const user = userRepo.create({ name: 'Alice' });
    await userRepo.save(user);

    // Create posts for the user
    const post1 = postRepo.create({ title: 'Post 1', user });
    const post2 = postRepo.create({ title: 'Post 2', user });
    await postRepo.save([post1, post2]);
    const fetchedUser = await userRepo.findOne({
      where: { id: user.id },
      relations: ['posts'],
    });
    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser?.posts).toHaveLength(2);
    expect(fetchedUser?.posts[0].title).toBe('Post 1');
    await postRepo.delete({});
    await userRepo.delete({});
  });

  test('fb many-to-many', async () => {
    // Create posts for the user
    const _courses = ['Math', 'Science', 'Arts'].map((name) => courseRepo.create({ name }));
    const courses = await courseRepo.save(_courses);
    const user = studentRepo.create({ name: 'John', courses });
    await studentRepo.save(user);

    const fb = new FindBoosted(db, studentRepo);
    let r = await fb.execute({ relations: ['courses'] });
    expect(r.data[0].courses.length).toBe(3);
    await courseRepo.delete({});
    await studentRepo.delete({});
  });

  test('fb many-to-one', async () => {
    const user = userRepo.create({ name: 'Bob' });
    await userRepo.save(user);
    // Create posts for the user
    const posts = new Array(20).fill(0).map((_, i) => postRepo.create({ title: `Post ${i + 1}`, user }));
    await postRepo.save(posts);

    const fb = new FindBoosted(db, userRepo);
    let r = await fb.execute({ relations: ['posts'], logging: true });
    expect(r.data[0].posts.length).toBe(20);

    r = await fb.execute({
      relations: ['posts'],
      where: { name: FbFn.Eq('Bob') },
    });
    expect(r.data.length).toBe(1);
    expect(r.data[0].posts.length).toBe(20);
    studentRepo.delete({});
    postRepo.delete({});
  });
});
