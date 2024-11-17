import math

def calculate_recencyImportance(newTotalUsers):
    value = math.exp(-0.05 * math.pow(math.log10(newTotalUsers), 3.3))
    print(f"{newTotalUsers}:     {value:.10f}")

# Example usage
calculate_recencyImportance(5)





# def calculate_weight(index):
#     print (math.exp(-0.9906728714367347 * index * 0.2))


# calculate_weight(0)
# calculate_weight(1)
# calculate_weight(2)
# calculate_weight(3)
# calculate_weight(4)



      




# def checkMain(one, two):
#     weights = [1.0, 0.8202594598776979, 0.6728255815188526, 0.551891548088552, 0.45269426314618216]
#     for i in range(len(one)):
#         print(((weights[0]*one[i]) + (weights[1]*two[i]))/(weights[0]+weights[1]))

# one = [0.009833962]
# two = [-0.013935824]

# checkMain(one, two)



# weights = [1.0, 0.8202594598776979, 0.6728255815188526, 0.551891548088552, 0.45269426314618216]

# def checkMain(one, two, three, four):
#     for i in range(len(one)):
#         print(((weights[0]*one[i]) + (weights[1]*two[i]) + (weights[2]*three[i]) + (weights[3]*four[i]))/(weights[0]+weights[1]+weights[2]+weights[3]))

# two = [-0.012495759, -0.013571361, 0.012900013, -0.013390891, 0.026940597, 0.036527175]
# three = [0.0015510218, -0.017014928, 0.025361609, -0.024732463, 0.026368244, 0.021167297]
# four = [-0.008461116, -0.0033282621, 0.015374376, -0.026001003, 0.014116744, 0.017249662]
# one = [-0.0054409914, 0.003046087, 0.014412839, -0.016351916, 0.030185925, 0.029563684]

# checkMain(one, two, three, four)