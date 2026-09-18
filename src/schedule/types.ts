/** ประเภทรถตามหัวตารางของขนส่ง */
export type VehicleType = 'car' | 'van' | 'pickup';

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  car: 'รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน (รถเก๋ง / กระบะ 4 ประตู)',
  van: 'รถยนต์นั่งส่วนบุคคลเกิน 7 คน (รถตู้)',
  pickup: 'รถยนต์บรรทุกส่วนบุคคล (กระบะบรรทุก / กระบะ 2 ประตู)',
};

/** หนึ่งแถวในตาราง = หนึ่งวันเปิดจองของรถประเภทหนึ่ง */
export interface ScheduleEntry {
  vehicleType: VehicleType;
  /** วันเปิดจอง ISO เช่น 2026-09-14 */
  openDate: string;
  /** หมวดอักษร เช่น "8ขจ" */
  prefix: string;
  /** ช่วงเลขที่เปิดให้จอง (รวมปลายทั้งสองข้าง) */
  from: number;
  to: number;
  /** ต้องนำเลขไปจดทะเบียนภายในวันนี้ ISO */
  registerBy: string;
  /** ข้อความช่องหมายเหตุ ถ้ามี */
  note?: string;
}

export interface Schedule {
  /** id ไฟล์ Google Drive ที่ขนส่งฝังไว้ในหน้า "ตารางเปิดจองหมายเลข" */
  sourceFileId: string;
  /** เวอร์ชันของตาราง = Last-Modified ของไฟล์บน Drive (ขนส่งอัปโหลดทับไฟล์เดิม) */
  version: string;
  fetchedAt: string;
  entries: ScheduleEntry[];
}
