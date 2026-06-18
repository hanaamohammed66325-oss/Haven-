export type CalendarType = "hijri" | "gregorian";

export type ComponentType = "quiz" | "midterm" | "final" | "project" | "assignment";
export type WeightUnit = "percent" | "points";

export interface GradeComponent {
  id: string;
  name: string;
  type: ComponentType;
  weight: number;
  unit: WeightUnit;
  total: number;
  score: number | null;
  date: string | null;
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  attendedLectures: number;
  totalLectures: number;
  components: GradeComponent[];
}

export interface Semester {
  name: string;
  startDate: string;
  endDate: string;
  calendarType: CalendarType;
  gradingSystem: "saudi5";
}

export interface AppData {
  profileName: string;
  language: "en" | "ar";
  semester: Semester;
  courses: Course[];
}
