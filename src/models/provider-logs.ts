import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VehicleValuation } from './vehicle-valuation';

@Entity()
export class ProviderLogs {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 7 })
  vrm: string;

  @Column()
  requestDateTime: Date;

  @Column({ type: 'integer' })
  requestDurationMs: number;

  @Column()
  requestUrl: string;

  @Column({ type: 'integer' })
  responseCode: number;

  @Column({ nullable: true })
  errorCode?: string;

  @Column({ nullable: true })
  errorMessage?: string;

  @Column()
  providerName: string;

  @ManyToOne(() => VehicleValuation, { nullable: true })
  @JoinColumn({ name: 'vrm', referencedColumnName: 'vrm' })
  vehicleValuation?: VehicleValuation;
}