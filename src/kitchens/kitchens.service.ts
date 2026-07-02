import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KitchensService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createKitchenDto: CreateKitchenDto) {
    return this.prisma.kitchen.create({
      data: createKitchenDto,
    });
  }

  async findAll() {
    return this.prisma.kitchen.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const kitchen = await this.prisma.kitchen.findUnique({
      where: { id },
    });
    if (!kitchen) {
      throw new NotFoundException(`Kitchen with ID ${id} not found`);
    }
    return kitchen;
  }

  async update(id: string, updateKitchenDto: UpdateKitchenDto) {
    await this.findOne(id); // Check existence
    return this.prisma.kitchen.update({
      where: { id },
      data: updateKitchenDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.kitchen.delete({
      where: { id },
    });
  }
}
