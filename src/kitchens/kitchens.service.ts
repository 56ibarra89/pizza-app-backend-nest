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

  async getCooksWithAssignments() {
    return this.prisma.user.findMany({
      where: { role: 'COCINERO' },
      include: {
        kitchenAssignments: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async updateCookAssignments(userId: string, assignments: { dayOfWeek: any; kitchenId: string | null }[]) {
    // Delete existing assignments for the given user
    await this.prisma.cookKitchenAssignment.deleteMany({
      where: { userId },
    });

    // Filter out null kitchenIds
    const validAssignments = assignments.filter(a => a.kitchenId !== null);

    if (validAssignments.length > 0) {
      await this.prisma.cookKitchenAssignment.createMany({
        data: validAssignments.map(a => ({
          userId,
          dayOfWeek: a.dayOfWeek,
          kitchenId: a.kitchenId as string,
        })),
      });
    }

    return { success: true };
  }
}
